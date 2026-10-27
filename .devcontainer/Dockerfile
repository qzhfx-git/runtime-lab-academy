FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04
RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ clang clangd clang-format cmake ninja-build gdb python3 \
    && rm -rf /var/lib/apt/lists/*
ENV CPP_COMPILER=/usr/bin/g++ LAB_CLANGD=/usr/bin/clangd
