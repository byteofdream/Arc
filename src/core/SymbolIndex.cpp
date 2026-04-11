#include "SymbolIndex.h"

#include <algorithm>

void SymbolIndex::clear() {
  QMutexLocker lock(&mutex_);
  symbols_.clear();
}

void SymbolIndex::replaceFile(const QString& absolutePath, const QVector<Symbol>& symbols) {
  QMutexLocker lock(&mutex_);
  symbols_.erase(std::remove_if(symbols_.begin(), symbols_.end(),
                                  [&absolutePath](const Symbol& s) { return s.file == absolutePath; }),
                   symbols_.end());
  for (const Symbol& s : symbols) symbols_.push_back(s);
}

QVector<Symbol> SymbolIndex::allSymbols() const {
  QMutexLocker lock(&mutex_);
  return symbols_;
}

QVector<Symbol> SymbolIndex::findByName(const QString& name) const {
  QMutexLocker lock(&mutex_);
  QVector<Symbol> out;
  for (const Symbol& s : symbols_) {
    if (s.name == name) out.push_back(s);
  }
  return out;
}

Symbol SymbolIndex::firstNamed(const QString& name) const {
  QMutexLocker lock(&mutex_);
  for (const Symbol& s : symbols_) {
    if (s.name == name) return s;
  }
  return Symbol{};
}
