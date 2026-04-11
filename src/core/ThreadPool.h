#pragma once

#include <condition_variable>
#include <cstddef>
#include <functional>
#include <mutex>
#include <queue>
#include <thread>
#include <vector>

/**
 * Small fixed-size worker pool for background work (indexing, analysis).
 * Thread-safe enqueue; workers join on destruction.
 */
class ThreadPool {
public:
  explicit ThreadPool(std::size_t numWorkers = 4);
  ~ThreadPool();

  ThreadPool(const ThreadPool&) = delete;
  ThreadPool& operator=(const ThreadPool&) = delete;

  void submit(std::function<void()> task);

  /** Stops accepting work and joins workers after the queue drains. */
  void shutdown();

private:
  void workerLoop();

  std::vector<std::thread> workers_;
  std::queue<std::function<void()>> tasks_;
  std::mutex mutex_;
  std::condition_variable cv_;
  bool stop_{false};
};
