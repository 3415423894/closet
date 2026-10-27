# 我们的衣橱 👗

你和对象两个人共用的「搭配记忆」小应用。把固定搭配好的衣服拍成照片传上来，随时翻看，互相可见。

## 技术

- 前端：React + Vite（移动端 H5，手机浏览器直接打开就能用）
- 数据：Supabase（云数据库 + 私有图片存储，两人共享）
- 登录：匿名登录（无需注册账号，各手机浏览器各自记住身份）
- 共享：创建人得到一个 7 位邀请码，对方输入即可加入同一个衣橱

## 快速开始（5 分钟）

### 1. 安装依赖

```bash
npm install
```

### 2. 准备 Supabase

1. 到 [supabase.com](https://supabase.com) 免费注册，新建一个项目。
2. 打开项目 **SQL Editor** → New query，把 [`sql/setup.sql`](sql/setup.sql) **全部内容**粘贴进去，点 **Run**。
3. 打开 **Authentication → Sign In / Up**，开启 **Anonymous sign-ins**。
4. 打开 **Project Settings → API**，记下 **Project URL** 和 **anon public key**。

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，把第 2、4 步拿到的值填进去：

```
VITE_SUPABASE_URL=https://你的项目.supabase.co
VITE_SUPABASE_ANON_KEY=你的anon key
```

### 4. 启动

```bash
npm run dev
```

浏览器打开终端里显示的地址（通常是 http://localhost:5173）。

## 手机怎么用

- 本地开发时，两台手机要能访问同一台机器 —— 把手机和电脑连到同一个 Wi-Fi，访问 `http://电脑局域网IP:5173`。
- 要长期用、任何地方都能打开，把 `dist/` 部署到 **Vercel / Netlify / Cloudflare Pages**（都是免费、几分钟搞定，也都支持绑定你自己的域名）。构建命令 `npm run build`，输出目录 `dist`。

## 使用流程

1. 第一部手机：填写称呼 → 进入 → 「创建我们的衣橱」→ 得到一个邀请码。
2. 第二部手机：填写称呼 → 进入 → 点「邀请」→ 输入邀请码 → 加入。
3. 之后两台手机点「＋」拍照 / 传相册，照片就同步到同一个衣橱了。

## 隐私说明

- 照片存在你们专属的 Supabase 项目里，默认**私有**，只有衣橱成员能通过登录后的签名链接查看。
- 邀请码只有创建人能看到，且加入后不设上限 —— 体验版不做复杂权限，别把邀请码贴到公开场合。

## 常见问题

**邀请码忘了 / 找不回来？**
邀请码只在创建时显示给创建人，体验版没有做找回。真丢了就在 Supabase 控制台 → Table Editor → `closets` 表里看 `code` 列。

**两人的称呼能改吗？**
体验版暂不支持改称呼，登录页填的时候想好。