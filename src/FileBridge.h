#pragma once

#include "core/AutoSaveManager.h"
#include "core/WorkspaceWatcher.h"

#include <QJsonArray>
#include <QJsonObject>
#include <QObject>

#include <memory>

class QNetworkAccessManager;
class ThreadPool;
class ProjectIndexer;

/**
 * QWebChannel bridge: filesystem, workspace intelligence (symbols), autosave, and file watching.
 * Heavy work runs on ThreadPool; this object stays on the GUI thread.
 */
class FileBridge final : public QObject {
  Q_OBJECT

public:
  explicit FileBridge(QObject* parent = nullptr);
  ~FileBridge() override;

  Q_INVOKABLE QString readFile(const QString& path);
  Q_INVOKABLE bool writeFile(const QString& path, const QString& content);
  Q_INVOKABLE QJsonArray listFiles(const QString& rootPath);

  Q_INVOKABLE QString openFileDialog();
  Q_INVOKABLE QString openFolderDialog();

  Q_INVOKABLE QString appDataDir();
  Q_INVOKABLE bool ensureDir(const QString& path);

  /** Directory shipped next to the executable (e.g. build/extensions); empty if missing. */
  Q_INVOKABLE QString bundledExtensionsDir() const;

  /**
   * Deletes a file or directory only if `path` is equal to `root` or nested under `root`
   * (prevents deleting arbitrary paths from JS).
   */
  Q_INVOKABLE bool removeRecursiveUnderRoot(const QString& root, const QString& path);

  /** Download a remote file (https/http). Parent directories of destPath are created. */
  Q_INVOKABLE void downloadToFile(const QString& url, const QString& destPath);

  /** GET request; result delivered via extensionFetchFinished. */
  Q_INVOKABLE void fetchUrlText(const QString& url);

  /**
   * Extract a .zip archive into destDir (uses `unzip` on Unix, `tar -xf` on Windows).
   * Returns false if the tool is missing or extraction fails.
   */
  Q_INVOKABLE bool unzipArchive(const QString& zipPath, const QString& destDir);

  /** Sets the opened folder; starts indexing and filesystem watches. */
  Q_INVOKABLE void setWorkspaceRoot(const QString& path);

  /** Symbol index (MVP regex extractor). */
  Q_INVOKABLE QJsonArray getAllSymbols();
  Q_INVOKABLE QJsonArray findSymbol(const QString& name);
  /** First match: { name, type, file, line } or empty object if none. */
  Q_INVOKABLE QJsonObject goToDefinition(const QString& name);

  /**
   * Autosave: policy 0 = debounce on change, 1 = focus lost only, 2 = both.
   * debounceMs clamped inside AutoSaveManager.
   */
  Q_INVOKABLE void configureAutoSave(int policy, int debounceMs);
  Q_INVOKABLE void notifyAutoSaveChange(const QString& path, const QString& content);
  Q_INVOKABLE void notifyAutoSaveFocusLost(const QString& path, const QString& content);
  /** Flush pending debounced save immediately (uses last notified content). */
  Q_INVOKABLE void triggerAutoSave(const QString& path);
  /** Call after Ctrl+S so autosave does not rewrite the same bytes. */
  Q_INVOKABLE void syncAutoSaveBaseline(const QString& path, const QString& content);

signals:
  void symbolIndexUpdated();
  void extensionDownloadFinished(bool ok, const QString& destPath, const QString& errorMessage);
  void extensionFetchFinished(bool ok, const QString& url, const QString& body, const QString& errorMessage);

private:
  static QString normalizePath(QString path);
  static QJsonObject buildNode(const QString& absPath);
  static bool isPathUnderRoot(const QString& root, const QString& path);

  std::unique_ptr<ThreadPool> threadPool_;
  QNetworkAccessManager* net_{nullptr};
  std::unique_ptr<ProjectIndexer> indexer_;
  AutoSaveManager autoSave_;
  WorkspaceWatcher workspaceWatcher_;
};
