# 隐藏 LinkedIn 已查看职位

[English](README.md)

一个简单的 Edge / Chrome 扩展，用于隐藏 LinkedIn 职位列表中标记为 `Viewed` 的职位。

## 功能

- 自动隐藏已查看职位
- 在本地保存开关设置
- 临时恢复当前标签页中的已查看职位
- 新打开的职位会保持显示，直到下一次刷新页面
- 支持 `li[data-occludable-job-id]` 和 `componentkey` 按钮两种完整卡片
- 不收集或传输用户数据

## 安装

1. 打开 `edge://extensions` 或 `chrome://extensions`
2. 开启`开发人员模式`
3. 点击`加载解压缩的扩展`
4. 选择本项目文件夹
5. 打开/刷新 `https://www.linkedin.com/jobs/`

## 限制

扩展按两种已确认的布局选中完整卡片，再精确匹配状态文字。
如果 LinkedIn 改变这些结构，选择器仍需要维护。

## 免责声明

本项目为独立项目，与 LinkedIn Corporation 无关联，也未获得其认可或赞助。

## License

[MIT](LICENSE)
