#pragma once

#include <QFileSystemWatcher>
#include <QObject>
#include <QStringList>
#include <QTimer>

/**
 * Watches a workspace tree (bounded number of directories) and emits a debounced signal
 * when something changes. Full recursive watching would need platform-specific APIs; this
 * MVP caps directory count and skips huge trees.
 */
class WorkspaceWatcher final : public QObject {
  Q_OBJECT

public:
  explicit WorkspaceWatcher(QObject* parent = nullptr);

  void setWorkspaceRoot(const QString& absolutePath);
  void clear();

signals:
  /** Batched notification after filesystem activity settles. */
  void workspaceTouched();

private:
  void rebuildWatches();
  void scheduleEmit();

  QFileSystemWatcher watcher_;
  QTimer debounce_;
  QString root_;
  static constexpr int kMaxWatchedDirs = 400;
};
