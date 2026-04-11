#pragma once

#include "Symbol.h"

#include <QMutex>
#include <QVector>

/**
 * Thread-safe in-memory symbol table. Lookup is linear in symbol count (fine for MVP).
 */
class SymbolIndex {
public:
  void clear();
  /** Replace all symbols originating from a single file. */
  void replaceFile(const QString& absolutePath, const QVector<Symbol>& symbols);

  QVector<Symbol> allSymbols() const;
  QVector<Symbol> findByName(const QString& name) const;
  /** First match for go-to-definition; empty name returns invalid symbol with empty file. */
  Symbol firstNamed(const QString& name) const;

private:
  mutable QMutex mutex_;
  QVector<Symbol> symbols_;
};
