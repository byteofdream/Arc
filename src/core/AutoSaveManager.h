#pragma once

#include <QHash>
#include <QObject>
#include <QString>
#include <QTimer>

#include <functional>

/**
 * Debounced and focus-loss driven saves. Avoids writing identical content repeatedly.
 *
 * Policy:
 * - DebounceOnChange: restart timer after each content notification.
 * - OnFocusLost: save when the UI reports focus loss (if dirty vs last written).
 * - Both: combine the two.
 */
class AutoSaveManager final : public QObject {
  Q_OBJECT

public:
  enum class Policy { DebounceOnChange = 0, OnFocusLost = 1, Both = 2 };

  using Writer = std::function<bool(const QString& path, const QString& content)>;

  explicit AutoSaveManager(QObject* parent = nullptr);

  void setWriter(Writer w) { writer_ = std::move(w); }
  void setPolicy(Policy p) { policy_ = p; }
  void setDebounceMs(int ms);

  /** Latest buffer for path; schedules debounced write when policy allows. */
  void notifyContentChanged(const QString& path, const QString& content);

  /** Called when editor loses focus; saves immediately if policy includes focus loss. */
  void notifyFocusLost(const QString& path, const QString& content);

  /** Flush pending debounced save for a file (e.g. explicit user action from UI). */
  void triggerAutoSave(const QString& path);

  /** After a successful explicit save from the UI: align buffers and cancel timers. */
  void syncBaseline(const QString& path, const QString& content);

private:
  struct Entry {
    QString content;
    QString lastWritten;
    QTimer* timer{nullptr};
  };

  void flush(const QString& path);
  void ensureTimer(const QString& path);

  Writer writer_;
  Policy policy_{Policy::Both};
  int debounceMs_{1500};
  QHash<QString, Entry> entries_;
};
