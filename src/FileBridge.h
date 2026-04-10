#pragma once

#include <QObject>
#include <QJsonArray>
#include <QJsonObject>

class FileBridge final : public QObject {
  Q_OBJECT

public:
  explicit FileBridge(QObject* parent = nullptr);

  Q_INVOKABLE QString readFile(const QString& path);
  Q_INVOKABLE bool writeFile(const QString& path, const QString& content);
  Q_INVOKABLE QJsonArray listFiles(const QString& rootPath);

  // Convenience helpers for the UI
  Q_INVOKABLE QString openFileDialog();
  Q_INVOKABLE QString openFolderDialog();

  // App directories (for settings/extensions)
  Q_INVOKABLE QString appDataDir();
  Q_INVOKABLE bool ensureDir(const QString& path);

private:
  static QString normalizePath(QString path);
  static QJsonObject buildNode(const QString& absPath);
};

