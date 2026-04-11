#include "FileBridge.h"

#include "core/ProjectIndexer.h"
#include "core/Symbol.h"
#include "core/ThreadPool.h"

#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QProcess>
#include <QJsonArray>
#include <QStringConverter>
#include <QFileDialog>
#include <QFileInfo>
#include <QJsonValue>
#include <QStandardPaths>
#include <QTextStream>

FileBridge::FileBridge(QObject* parent) : QObject(parent) {
  net_ = new QNetworkAccessManager(this);
  threadPool_ = std::make_unique<ThreadPool>(4);
  indexer_ = std::make_unique<ProjectIndexer>(*threadPool_, this);

  autoSave_.setWriter([this](const QString& path, const QString& content) {
    return writeFile(path, content);
  });
  autoSave_.setPolicy(AutoSaveManager::Policy::Both);
  autoSave_.setDebounceMs(1500);

  connect(indexer_.get(), &ProjectIndexer::indexUpdated, this, &FileBridge::symbolIndexUpdated);
  connect(&workspaceWatcher_, &WorkspaceWatcher::workspaceTouched, this, [this] {
    if (indexer_) indexer_->scheduleFullReindexDebounced();
  });
}

FileBridge::~FileBridge() {
  if (threadPool_) threadPool_->shutdown();
  indexer_.reset();
  threadPool_.reset();
}

QString FileBridge::normalizePath(QString path) {
  if (path.startsWith(QStringLiteral("file://"))) {
    path.remove(0, QStringLiteral("file://").size());
  }
  return QDir::cleanPath(path);
}

QString FileBridge::readFile(const QString& path) {
  const QString p = normalizePath(path);
  QFile f(p);
  if (!f.open(QIODevice::ReadOnly | QIODevice::Text)) {
    return QString();
  }
  QTextStream in(&f);
  in.setEncoding(QStringConverter::Utf8);
  return in.readAll();
}

bool FileBridge::writeFile(const QString& path, const QString& content) {
  const QString p = normalizePath(path);
  QFile f(p);
  if (!f.open(QIODevice::WriteOnly | QIODevice::Truncate | QIODevice::Text)) return false;
  QTextStream out(&f);
  out.setEncoding(QStringConverter::Utf8);
  out << content;
  out.flush();
  const bool ok = f.flush();
  if (ok && indexer_) indexer_->requestReindexFile(p);
  return ok;
}

QJsonObject FileBridge::buildNode(const QString& absPath) {
  QFileInfo info(absPath);
  QJsonObject node;
  node["name"] = info.fileName().isEmpty() ? info.absoluteFilePath() : info.fileName();
  node["path"] = info.absoluteFilePath();
  node["isDir"] = info.isDir();

  if (info.isDir()) {
    QDir dir(info.absoluteFilePath());
    dir.setFilter(QDir::NoDotAndDotDot | QDir::AllEntries);
    dir.setSorting(QDir::DirsFirst | QDir::Name | QDir::IgnoreCase);

    QJsonArray children;
    const QFileInfoList entries = dir.entryInfoList();
    for (const QFileInfo& e : entries) {
      const QString n = e.fileName();
      if (n == ".git" || n == "node_modules" || n == ".cache" || n == "dist" || n == "build") continue;
      children.append(buildNode(e.absoluteFilePath()));
    }
    node["children"] = children;
  }

  return node;
}

QJsonArray FileBridge::listFiles(const QString& rootPath) {
  const QString root = normalizePath(rootPath);
  QJsonArray arr;

  QFileInfo info(root);
  if (!info.exists()) return arr;

  if (info.isDir()) {
    QJsonObject rootNode = buildNode(info.absoluteFilePath());
    arr.append(rootNode);
    return arr;
  }

  QJsonObject parentNode = buildNode(info.absolutePath());
  arr.append(parentNode);
  return arr;
}

QString FileBridge::openFileDialog() {
  const QString start = QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation);
  const QString file = QFileDialog::getOpenFileName(nullptr, "Open File", start);
  return file;
}

QString FileBridge::openFolderDialog() {
  const QString start = QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation);
  const QString dir = QFileDialog::getExistingDirectory(nullptr, "Open Folder", start);
  return dir;
}

QString FileBridge::appDataDir() {
  QString dir = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
  if (dir.isEmpty()) {
    dir = QDir::homePath() + "/.arc-ide";
  }
  ensureDir(dir);
  return QDir::cleanPath(dir);
}

bool FileBridge::ensureDir(const QString& path) {
  const QString p = normalizePath(path);
  QDir d(p);
  if (d.exists()) return true;
  return QDir().mkpath(p);
}

QString FileBridge::bundledExtensionsDir() const {
  const QString dir = QDir(QCoreApplication::applicationDirPath()).filePath(QStringLiteral("extensions"));
  if (QDir(dir).exists()) return QDir::cleanPath(dir);
  return QString();
}

bool FileBridge::isPathUnderRoot(const QString& root, const QString& path) {
  const QString r = QDir::cleanPath(root);
  const QString p = QDir::cleanPath(path);
  if (p == r) return true;
  const QString prefix = r + QLatin1Char('/');
  return p.startsWith(prefix);
}

bool FileBridge::removeRecursiveUnderRoot(const QString& root, const QString& path) {
  const QString r = normalizePath(root);
  const QString p = normalizePath(path);
  if (!isPathUnderRoot(r, p)) return false;
  QFileInfo fi(p);
  if (fi.isFile()) return QFile::remove(p);
  QDir d(p);
  if (!d.exists()) return false;
  return d.removeRecursively();
}

void FileBridge::downloadToFile(const QString& url, const QString& destPath) {
  const QString p = normalizePath(destPath);
  QFileInfo fi(p);
  ensureDir(fi.absolutePath());

  const QUrl qurl(url);
  if (!qurl.isValid() || (qurl.scheme() != QStringLiteral("https") && qurl.scheme() != QStringLiteral("http"))) {
    emit extensionDownloadFinished(false, p, QStringLiteral("Invalid URL (use http/https)"));
    return;
  }

  QNetworkReply* reply = net_->get(QNetworkRequest(qurl));
  connect(reply, &QNetworkReply::finished, this, [this, reply, p]() {
    const bool netOk = reply->error() == QNetworkReply::NoError;
    QString err = reply->errorString();
    if (netOk) {
      QFile f(p);
      if (f.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
        f.write(reply->readAll());
        f.close();
        emit extensionDownloadFinished(true, p, QString());
      } else {
        emit extensionDownloadFinished(false, p, QStringLiteral("Cannot write destination"));
      }
    } else {
      emit extensionDownloadFinished(false, p, err);
    }
    reply->deleteLater();
  });
}

void FileBridge::fetchUrlText(const QString& url) {
  const QUrl qurl(url);
  if (!qurl.isValid() || (qurl.scheme() != QStringLiteral("https") && qurl.scheme() != QStringLiteral("http"))) {
    emit extensionFetchFinished(false, url, QString(), QStringLiteral("Invalid URL"));
    return;
  }
  QNetworkReply* reply = net_->get(QNetworkRequest(qurl));
  connect(reply, &QNetworkReply::finished, this, [this, reply, url]() {
    const bool ok = reply->error() == QNetworkReply::NoError;
    const QString body = QString::fromUtf8(reply->readAll());
    const QString err = ok ? QString() : reply->errorString();
    emit extensionFetchFinished(ok, url, body, err);
    reply->deleteLater();
  });
}

bool FileBridge::unzipArchive(const QString& zipPath, const QString& destDir) {
  const QString zip = normalizePath(zipPath);
  const QString dest = normalizePath(destDir);
  ensureDir(dest);
  QProcess proc;
#ifdef Q_OS_WIN
  proc.setProgram(QStringLiteral("tar"));
  proc.setArguments({QStringLiteral("-xf"), QDir::toNativeSeparators(zip), QStringLiteral("-C"),
                       QDir::toNativeSeparators(dest)});
#else
  proc.setProgram(QStringLiteral("unzip"));
  proc.setArguments({QStringLiteral("-o"), QStringLiteral("-q"), zip, QStringLiteral("-d"), dest});
#endif
  proc.setProcessChannelMode(QProcess::MergedChannels);
  proc.start();
  if (!proc.waitForFinished(120000)) return false;
  return proc.exitCode() == 0;
}

void FileBridge::setWorkspaceRoot(const QString& path) {
  const QString n = normalizePath(path);
  workspaceWatcher_.setWorkspaceRoot(n);
  if (indexer_) indexer_->setWorkspaceRoot(n);
}

QJsonArray FileBridge::getAllSymbols() {
  if (!indexer_) return {};
  QJsonArray arr;
  for (const Symbol& s : indexer_->symbolIndex().allSymbols()) {
    arr.append(symbolToJson(s));
  }
  return arr;
}

QJsonArray FileBridge::findSymbol(const QString& name) {
  if (!indexer_) return {};
  QJsonArray arr;
  for (const Symbol& s : indexer_->symbolIndex().findByName(name)) {
    arr.append(symbolToJson(s));
  }
  return arr;
}

QJsonObject FileBridge::goToDefinition(const QString& name) {
  if (!indexer_) return {};
  const Symbol s = indexer_->symbolIndex().firstNamed(name);
  if (s.file.isEmpty()) return {};
  return symbolToJson(s);
}

void FileBridge::configureAutoSave(int policy, int debounceMs) {
  autoSave_.setPolicy(static_cast<AutoSaveManager::Policy>(policy));
  autoSave_.setDebounceMs(debounceMs);
}

void FileBridge::notifyAutoSaveChange(const QString& path, const QString& content) {
  autoSave_.notifyContentChanged(normalizePath(path), content);
}

void FileBridge::notifyAutoSaveFocusLost(const QString& path, const QString& content) {
  autoSave_.notifyFocusLost(normalizePath(path), content);
}

void FileBridge::triggerAutoSave(const QString& path) {
  autoSave_.triggerAutoSave(normalizePath(path));
}

void FileBridge::syncAutoSaveBaseline(const QString& path, const QString& content) {
  autoSave_.syncBaseline(normalizePath(path), content);
}
