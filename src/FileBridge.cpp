#include "FileBridge.h"

#include <QDir>
#include <QFile>
#include <QFileDialog>
#include <QFileInfo>
#include <QJsonValue>
#include <QStandardPaths>
#include <QTextStream>

FileBridge::FileBridge(QObject* parent) : QObject(parent) {}

QString FileBridge::normalizePath(QString path) {
  // Accept both file:// URLs and plain paths
  if (path.startsWith("file://")) {
    // QUrl::fromUserInput is a bit permissive; keep simple here
    path.remove(0, QString("file://").size());
    while (path.startsWith('/')) {
      // keep leading slash on unix; remove only the extra ones from file:////...
      break;
    }
  }
  return QDir::cleanPath(path);
}

QString FileBridge::readFile(const QString& path) {
  const QString p = normalizePath(path);
  QFile f(p);
  if (!f.open(QIODevice::ReadOnly | QIODevice::Text)) {
    return QString(); // JS treats empty as error if file exists; we'll also expose error via console in JS
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
  return true;
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
      // Skip very large / noisy folders by default (keeps UI snappy)
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

  // If a file is passed, return its parent folder
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
  // e.g. ~/.local/share/Arc Mini IDE
  QString dir = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
  if (dir.isEmpty()) {
    dir = QDir::homePath() + "/.arc-mini-ide";
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

