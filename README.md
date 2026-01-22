# Dunes Dictionary

Admin + Public Tracking System — Deployment & Usage Guide

## 1. 系统目的

本系统用于在线追踪 public 端用户行为，并在 admin dashboard 中实时/准实时可视化这些数据。
目标是提供一个可对外演示、可长期运行的完整 demo，而非仅限本地调试。

## 2. 系统架构（线上版本）

```
Public (Vercel)
   │  POST /events
   ▼
API Server (ECS + Node.js + pm2)
   │  in-memory / lightweight persistence
   ▼
Admin Dashboard (Vercel)
   │  GET /api/dashboard /api/terms
   ▼
Visualization
```

Public：用户浏览、点击、滚动等行为的产生端。
API Server：统一接收事件、聚合统计、提供查询接口。
Admin：读取同一事件源并进行可视化展示。

## 3. 各组件职责

### 3.1 Public（Vercel）

- 负责触发并发送用户行为事件
- 所有事件统一通过相对路径：`POST /events`
- 通过 `vercel.json` 将请求 rewrite 到后端 API Server

### 3.2 API Server（ECS）

- 技术栈：Node.js + Express + pm2
- 监听地址：`0.0.0.0:3000`
- 核心职责：
  - 接收并记录 `POST /events`
  - 提供统计接口：`/api/dashboard`、`/api/terms`、`/health`
  - 由 pm2 守护运行，支持自动重启、断线后持续服务

### 3.3 Admin（Vercel）

- 仅负责读取和展示数据
- 不直接存储数据
- 通过 `vercel.json` rewrites：
  - `/api/*` → API Server
  - `/events` → API Server
- Dashboard 页面刷新即可反映最新 public 行为

## 4. 部署方式说明

### 4.1 后端（API Server）

- 部署在云服务器（ECS）
- 通过 pm2 启动：

```bash
pm2 start server.js --name dd-admin
pm2 save
pm2 startup
```

- 特性：
  - SSH 断开不影响运行
  - 服务器重启后自动恢复
  - 无需人工值守

### 4.2 前端（Public / Admin）

- 均部署在 Vercel
- 仅通过 GitHub 更新
- 修改流程：
  1. 更新 GitHub 仓库
  2. Vercel 自动重新部署
  3. 不需要登录服务器

## 5. 数据流验证方式（Demo Checklist）

### 验证写入（Public → Server）

1. 在 public 页面进行一次交互
2. 本地执行：

```bash
curl "http://<API_SERVER_IP>:3000/events?limit=5"
```

3. 确认出现最新事件

### 验证读取（Server → Admin）

1. 刷新 admin dashboard
2. 观察统计数值/列表变化
3. DevTools Network 中 `/api/dashboard` 返回 200 且数据更新

## 6. 运行与维护说明

- 可以安全关闭 SSH 窗口
- pm2 会持续运行服务
- 正常情况下无需干预
- 需要关注的情况：
  - 服务器欠费/关机
  - 磁盘或内存耗尽
  - 人为停止 pm2 进程

## 7. 当前系统状态总结（一句话版）

This system runs a persistent backend API on ECS (managed by pm2),
allowing public user interactions to be logged in real time and
visualized through an admin dashboard deployed on Vercel.
