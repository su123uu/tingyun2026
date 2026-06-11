# 停云山居 Vue 后台

CloudBase 云应用服务名：`tysj8`

当前模块：

- 首页 Banner 管理

## 本地开发

```bash
npm install
npm run dev
```

## 本地调试启动记录

本次可稳定访问的启动方式：

```powershell
Start-Process -FilePath "C:\Program Files\nodejs\node.exe" -ArgumentList @('node_modules/vite/bin/vite.js','--host','0.0.0.0','--port','5173') -WorkingDirectory 'E:\AI编程\停云小程序\tysj8' -WindowStyle Hidden
```

访问地址：

- http://localhost:5173/
- http://127.0.0.1:5173/

如果 Codex/终端里前台运行 `npm run dev`，命令结束或超时后服务会被停止；要给浏览器持续访问，需要用上面的后台进程方式启动。项目内也保留了同等配置脚本：

```bash
npm run dev:local
```

## 构建

```bash
npm run build
```

## 部署

```bash
tcb app deploy tysj8 -e cloud1-d6gzs6wuu4b4e902e --cwd ./tysj8 --framework vite --install-command "npm install --registry=https://registry.npmmirror.com" --build-command "npm run build" --output-dir dist --deploy-path /tysj8 -f
```
