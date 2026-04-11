#include "AutoSaveManager.h"

AutoSaveManager::AutoSaveManager(QObject* parent) : QObject(parent) {}

void AutoSaveManager::setDebounceMs(int ms) { debounceMs_ = qMax(200, ms); }

void AutoSaveManager::ensureTimer(const QString& path) {
  Entry& e = entries_[path];
  if (e.timer) return;
  e.timer = new QTimer(this);
  e.timer->setSingleShot(true);
  connect(e.timer, &QTimer::timeout, this, [this, path] { flush(path); });
}

void AutoSaveManager::flush(const QString& path) {
  if (!writer_) return;
  auto it = entries_.find(path);
  if (it == entries_.end()) return;
  Entry& e = it.value();
  if (e.content == e.lastWritten) return;
  if (writer_(path, e.content)) e.lastWritten = e.content;
}

void AutoSaveManager::notifyContentChanged(const QString& path, const QString& content) {
  Entry& e = entries_[path];
  e.content = content;

  const bool debounce =
      policy_ == Policy::DebounceOnChange || policy_ == Policy::Both;
  if (!debounce) return;

  ensureTimer(path);
  e.timer->start(debounceMs_);
}

void AutoSaveManager::notifyFocusLost(const QString& path, const QString& content) {
  Entry& e = entries_[path];
  e.content = content;

  const bool onBlur = policy_ == Policy::OnFocusLost || policy_ == Policy::Both;
  if (onBlur) flush(path);
}

void AutoSaveManager::triggerAutoSave(const QString& path) {
  Entry& e = entries_[path];
  if (e.timer && e.timer->isActive()) e.timer->stop();
  flush(path);
}

void AutoSaveManager::syncBaseline(const QString& path, const QString& content) {
  Entry& e = entries_[path];
  e.content = content;
  e.lastWritten = content;
  if (e.timer && e.timer->isActive()) e.timer->stop();
}
