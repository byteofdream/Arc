#include "ProjectIndexer.h"

#include "CodeAnalyzer.h"

#include <QDir>
#include <QDirIterator>
#include <QFile>
#include <QFileInfo>
#include <QHash>
#include <QStringList>
#include <QStringConverter>
#include <QTextStream>

namespace {

bool isSkippedDir(const QString& name) {
  return name == QLatin1String(".git") || name == QLatin1String("node_modules") ||
         name == QLatin1String(".cache") || name == QLatin1String("dist") ||
         name == QLatin1String("build") || name == QLatin1String(".qt");
}

bool isSourceSuffix(const QString& suf) {
  static const QStringList k{QStringLiteral("c"),   QStringLiteral("cc"), QStringLiteral("cpp"),
                             QStringLiteral("cxx"), QStringLiteral("h"),  QStringLiteral("hpp"),
                             QStringLiteral("hh"),  QStringLiteral("hxx"), QStringLiteral("m"),
                             QStringLiteral("mm"),  QStringLiteral("js"), QStringLiteral("mjs"),
                             QStringLiteral("cjs"), QStringLiteral("ts"), QStringLiteral("tsx"),
                             QStringLiteral("py"),  QStringLiteral("sway")};
  return k.contains(suf, Qt::CaseInsensitive);
}

QString readAllUtf8(const QString& path) {
  QFile f(path);
  if (!f.open(QIODevice::ReadOnly | QIODevice::Text)) return {};
  QTextStream in(&f);
  in.setEncoding(QStringConverter::Utf8);
  return in.readAll();
}

QStringList collectSourceFiles(const QString& root) {
  QStringList out;
  const QDir rootDir(root);
  QDirIterator it(root, QDir::Files | QDir::NoDotAndDotDot, QDirIterator::Subdirectories);
  while (it.hasNext()) {
    const QString path = it.next();
    const QFileInfo fi = it.fileInfo();
    if (isSkippedDir(fi.fileName())) continue;
    const QString rel = rootDir.relativeFilePath(fi.absoluteFilePath());
    bool skip = false;
    const QStringList parts = rel.split(QLatin1Char('/'), Qt::SkipEmptyParts);
    for (const QString& part : parts) {
      if (isSkippedDir(part)) {
        skip = true;
        break;
      }
    }
    if (skip) continue;
    if (!isSourceSuffix(fi.suffix())) continue;
    out.push_back(fi.absoluteFilePath());
  }
  return out;
}

bool isUnderRoot(const QString& root, const QString& path) {
  const QString canonRoot = QDir::cleanPath(root);
  const QString canonPath = QDir::cleanPath(path);
  return canonPath.startsWith(canonRoot + QLatin1Char('/')) || canonPath == canonRoot;
}

}  // namespace

ProjectIndexer::ProjectIndexer(ThreadPool& pool, QObject* parent)
    : QObject(parent), pool_(pool) {
  debounce_.setSingleShot(true);
  debounce_.setInterval(450);
  connect(&debounce_, &QTimer::timeout, this, [this] { requestFullReindex(); });
}

void ProjectIndexer::setWorkspaceRoot(const QString& absolutePath) {
  workspaceRoot_ = QDir::cleanPath(absolutePath);
  symbolIndex_.clear();
  emit indexUpdated();
  if (!workspaceRoot_.isEmpty()) requestFullReindex();
}

void ProjectIndexer::scheduleFullReindexDebounced() { debounce_.start(); }

void ProjectIndexer::requestFullReindex() {
  const QString root = workspaceRoot_;
  if (root.isEmpty()) {
    symbolIndex_.clear();
    emit indexUpdated();
    return;
  }

  const int jobId = ++fullJobId_;
  pool_.submit([this, root, jobId]() {
    const QStringList files = collectSourceFiles(root);
    QHash<QString, QVector<Symbol>> byFile;
    byFile.reserve(files.size());
    for (const QString& path : files) {
      const QString content = readAllUtf8(path);
      byFile.insert(path, CodeAnalyzer::analyzeFile(path, content));
    }
    QMetaObject::invokeMethod(this, [this, byFile, jobId]() { applyFullScan(byFile, jobId); },
                              Qt::QueuedConnection);
  });
}

void ProjectIndexer::applyFullScan(const QHash<QString, QVector<Symbol>>& byFile, int jobId) {
  if (jobId != fullJobId_.load()) return;
  symbolIndex_.clear();
  for (auto it = byFile.constBegin(); it != byFile.constEnd(); ++it) {
    symbolIndex_.replaceFile(it.key(), it.value());
  }
  emit indexUpdated();
}

void ProjectIndexer::requestReindexFile(const QString& absolutePath) {
  const QString path = QDir::cleanPath(absolutePath);
  const QString root = workspaceRoot_;
  if (root.isEmpty() || !isUnderRoot(root, path)) return;

  pool_.submit([this, path]() {
    const QString content = readAllUtf8(path);
    const QVector<Symbol> syms = CodeAnalyzer::analyzeFile(path, content);
    QMetaObject::invokeMethod(
        this,
        [this, path, syms]() {
          symbolIndex_.replaceFile(path, syms);
          emit indexUpdated();
        },
        Qt::QueuedConnection);
  });
}
