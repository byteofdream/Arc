#include "WorkspaceWatcher.h"

#include <QDir>
#include <QDirIterator>
#include <QFileInfo>

namespace {

bool isSkippedDir(const QString& name) {
  return name == QLatin1String(".git") || name == QLatin1String("node_modules") ||
         name == QLatin1String(".cache") || name == QLatin1String("dist") ||
         name == QLatin1String("build") || name == QLatin1String(".qt");
}

}  // namespace

WorkspaceWatcher::WorkspaceWatcher(QObject* parent) : QObject(parent) {
  debounce_.setSingleShot(true);
  debounce_.setInterval(350);
  connect(&debounce_, &QTimer::timeout, this, [this] { emit workspaceTouched(); });
  connect(&watcher_, &QFileSystemWatcher::directoryChanged, this, &WorkspaceWatcher::scheduleEmit);
  connect(&watcher_, &QFileSystemWatcher::fileChanged, this, &WorkspaceWatcher::scheduleEmit);
}

void WorkspaceWatcher::clear() {
  debounce_.stop();
  const QStringList paths = watcher_.directories() + watcher_.files();
  for (const QString& p : paths) watcher_.removePath(p);
  root_.clear();
}

void WorkspaceWatcher::setWorkspaceRoot(const QString& absolutePath) {
  clear();
  root_ = QDir::cleanPath(absolutePath);
  if (root_.isEmpty()) return;
  rebuildWatches();
}

void WorkspaceWatcher::rebuildWatches() {
  QFileInfo ri(root_);
  if (!ri.exists() || !ri.isDir()) return;

  QDirIterator it(root_, QDir::Dirs | QDir::NoDotAndDotDot, QDirIterator::Subdirectories);
  QStringList dirs;
  dirs.push_back(ri.absoluteFilePath());
  const QDir rootDir(root_);
  while (it.hasNext()) {
    if (dirs.size() >= kMaxWatchedDirs) break;
    it.next();
    const QFileInfo fi = it.fileInfo();
    const QString rel = rootDir.relativeFilePath(fi.absoluteFilePath());
    bool skip = false;
    for (const QString& part : rel.split(QLatin1Char('/'), Qt::SkipEmptyParts)) {
      if (isSkippedDir(part)) {
        skip = true;
        break;
      }
    }
    if (skip) continue;
    dirs.push_back(fi.absoluteFilePath());
  }

  for (const QString& d : dirs) watcher_.addPath(d);
}

void WorkspaceWatcher::scheduleEmit() { debounce_.start(); }
