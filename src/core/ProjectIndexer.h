#pragma once

#include "SymbolIndex.h"
#include "ThreadPool.h"

#include <QHash>
#include <QObject>
#include <QTimer>
#include <atomic>

class ProjectIndexer final : public QObject {
  Q_OBJECT

public:
  explicit ProjectIndexer(ThreadPool& pool, QObject* parent = nullptr);

  void setWorkspaceRoot(const QString& absolutePath);
  QString workspaceRoot() const { return workspaceRoot_; }

  /** Clears or rebuilds the symbol index off the UI thread. */
  void requestFullReindex();
  void requestReindexFile(const QString& absolutePath);

  /** Coalesce rapid filesystem events into one full scan. */
  void scheduleFullReindexDebounced();

  const SymbolIndex& symbolIndex() const { return symbolIndex_; }
  SymbolIndex& symbolIndex() { return symbolIndex_; }

signals:
  void indexUpdated();

private:
  void applyFullScan(const QHash<QString, QVector<Symbol>>& byFile, int jobId);

  ThreadPool& pool_;
  SymbolIndex symbolIndex_;
  QString workspaceRoot_;
  QTimer debounce_;
  std::atomic<int> fullJobId_{0};
};
