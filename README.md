# 供水调度后端服务

面向调度大屏、值班 App 和客服系统提供统一能力的后端服务。

## 技术栈

- **运行时**: Node.js 18+
- **语言**: TypeScript 5.x
- **Web框架**: Express 4.x
- **数据库**: SQLite (better-sqlite3)
- **参数验证**: Joi 17.x
- **安全防护**: helmet, cors
- **日志**: winston

## 项目结构

```
water-supply-dispatch/
├── src/
│   ├── app.ts                    # 应用入口
│   ├── config/
│   │   └── env.ts               # 环境配置
│   ├── middleware/
│   │   ├── errorHandler.ts      # 错误处理中间件
│   │   └── validator.ts         # 参数验证中间件
│   ├── utils/
│   │   └── logger.ts            # 日志工具
│   ├── database/
│   │   ├── index.ts             # 数据库连接
│   │   ├── schema.ts            # 数据库表结构
│   │   └── seed.ts              # 初始化数据
│   └── modules/
│       ├── situation/           # 实时态势模块
│       ├── pipeEvent/           # 管网事件模块
│       ├── pump/                # 泵站控制模块
│       ├── forecast/            # 用水预测模块
│       ├── notification/        # 通知模块
│       └── query/               # 查询统计模块
├── data/                        # 数据库文件目录
├── logs/                        # 日志目录
├── package.json
├── tsconfig.json
└── README.md
```

## 功能模块

### 1. 实时态势模块 (`/api/v1/situation`)
- 获取分区列表
- 获取分区实时流量水压及24小时趋势
- 获取所有分区实时监控数据
- 上报分区监控数据

### 2. 管网事件模块 (`/api/v1/pipe-events`)
- 上报爆管/停水事件
- 查询事件列表
- 获取事件详情
- 计算影响小区
- 获取推荐关阀顺序
- 执行阀门操作
- 登记抢修进度
- 查看事件时间线

### 3. 泵站控制模块 (`/api/v1/pump-control`)
- 获取泵站列表
- 查询泵组运行状态
- 获取泵组运行历史
- 下发启停申请
- 审批启停申请
- 记录泵组运行数据

### 4. 用水预测模块 (`/api/v1/forecast`)
- 获取分区24小时用水预测
- 获取未来用水峰值（早/晚高峰）
- 获取所有分区预测概览
- 生成调度建议
- 查询调度建议列表
- 更新建议状态

### 5. 通知模块 (`/api/v1/notification`)
- 创建停水通知
- 发送通知
- 查询通知列表
- 获取事件关联通知
- 自动生成停水通知

### 6. 查询统计模块 (`/api/v1/query`)
- 接收用户来电并打标签
- 查询来电记录
- 查看事件时间线
- 获取当前班次信息
- 提交班次交接摘要
- 查询历史班次记录
- 统计事件处置时长
- 获取大屏统计概览

## 快速开始

### 安装依赖

```bash
npm install
```

### 初始化数据库（可选，启动时自动建表）

```bash
npm run seed
```

### 开发模式运行

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
```

### 生产环境运行

```bash
npm start
```

## 健康检查

```bash
curl http://localhost:3000/health
```

## API 示例

### 获取所有分区

```bash
curl http://localhost:3000/api/v1/situation/zones
```

### 获取分区实时监控

```bash
curl http://localhost:3000/api/v1/situation/zones/1/monitor
```

### 上报爆管事件

```bash
curl -X POST http://localhost:3000/api/v1/pipe-events/events \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "pipe_break",
    "severity": "high",
    "location": "东城区主干道",
    "description": "DN800主管道爆裂",
    "reported_by": "巡检员",
    "zone_id": 1
  }'
```

### 获取泵组状态

```bash
curl http://localhost:3000/api/v1/pump-control/pumps
```

### 获取用水预测

```bash
curl http://localhost:3000/api/v1/forecast/forecast/1
```

### 获取大屏统计

```bash
curl http://localhost:3000/api/v1/query/statistics/dashboard
```

## 数据字典

### 事件类型
- `pipe_break`: 爆管
- `water_outage`: 停水
- `leak`: 泄漏
- `pressure_abnormal`: 压力异常

### 事件严重程度
- `low`: 低
- `medium`: 中
- `high`: 高
- `critical`: 紧急

### 事件状态
- `reported`: 已上报
- `processing`: 处理中
- `valve_closed`: 已关阀
- `repairing`: 抢修中
- `completed`: 已完成
- `cancelled`: 已取消

### 泵组状态
- `running`: 运行中
- `standby`: 备用
- `maintenance`: 维护中

### 申请状态
- `pending`: 待审批
- `approved`: 已批准
- `rejected`: 已拒绝

### 建议状态
- `pending`: 待处理
- `adopted`: 已采纳
- `rejected`: 已拒绝

## 统一响应格式

```json
{
  "code": 200,
  "message": "success",
  "data": {}
}
```

### 错误响应

```json
{
  "code": 404,
  "message": "资源不存在"
}
```

## 配置

可通过环境变量配置：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 3000 | 服务端口 |
| DB_PATH | ./data/water_dispatch.db | 数据库路径 |
| LOG_LEVEL | info | 日志级别 |

## License

MIT
