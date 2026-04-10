cmake_minimum_required(VERSION 3.21)

project(ArcMiniIDE LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

find_package(Qt6 REQUIRED COMPONENTS Widgets WebEngineWidgets WebChannel)

qt_add_executable(arc-mini-ide
  src/main.cpp
  src/FileBridge.h
  src/FileBridge.cpp
  resources/resources.qrc
)

target_link_libraries(arc-mini-ide PRIVATE
  Qt6::Widgets
  Qt6::WebEngineWidgets
  Qt6::WebChannel
)

