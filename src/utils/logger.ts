import winston from 'winston';

// 环境变量
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_FILEPATH = process.env.LOG_FILEPATH;

// 日志传输配置
const loggerTransports: winston.transport[] = [];

// 配置日志输出
if (LOG_FILEPATH) {
//   如果配置了文件路径，添加文件日志
  loggerTransports.push(new winston.transports.File({ filename: LOG_FILEPATH }));
}

// 添加控制台日志，在stdio模式下重定向到stderr
loggerTransports.push(new winston.transports.Console({
  stderrLevels: ['error', 'warn', 'info', 'verbose', 'debug', 'silly']
}));

// 创建统一的logger实例
export const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.simple()
  ),
  transports: loggerTransports
});