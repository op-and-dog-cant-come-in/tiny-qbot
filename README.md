# TinyQBot

一个基于 [NapCatQQ](https://github.com/NapNeko/NapCatQQ) 的简易 QQ 群机器人项目，基于 NodeJS 开发，用于自己的宿舍小群自娱自乐。

特点：

- 基于 NapcatQQ 的 docker 镜像与 NapLink 提供 QQ 机器人能力
- 使用魔搭的 LLM 服务实现 AI 对话能力
- 目前一个机器人实例只能服务一个 QQ 群，尚未支持私聊对话功能
- 内置若干功能插件

# 使用方式

确保系统环境中安装了 docker 命令行工具，项目运行时会自动使用 `docker-compose` 命令启动 napcat 服务。

docker 的安装教程可参考：

- [Install Docker Desktop on Windows](https://docs.docker.com/desktop/setup/install/windows-install/)
- [Install Docker Desktop on Ubuntu](https://docs.docker.com/desktop/setup/install/linux/ubuntu/)

项目使用 volta 管理 NodeJS 与包管理器版本，确保命令行中可使用 `volta` 命令。

- volta 的安装教程可参考：[Volta 无痛的 JavaScript 工具管理器](https://zh.voltajs.com/)

准备好这两样后，到 `src\index.ts` 文件中填写必要的账号和 apiKey 等信息，然后通过以下命令启动项目：

```shell
pnpm i
pnpm dev
```

使用时可以直接 @ 机器人账号进行对话，也可以通过指令语法调用一些内置工具。

# 插件

## menu

获取当前可用的所有指令列表，提供如下指令：

- `/菜单`：获取当前可用的所有指令列表

该插件会自动汇总所有已注册的指令，并以格式化的方式展示给用户。

## neko-assist

核心的 ai 对话服务插件，会自动监听群里的消息，以猫猫的身份与群里消息进行互动。

- 通过 @ 猫猫或者在消息中包含关键字 “猫猫” 或 “猫” 可以触发猫猫的回复
- 对于其他的群消息，猫猫也有一定概率进行回复
- 猫猫会响应戳一戳的操作
- 根据需要自动调用系统指令

插件提供如下指令：

- `/current-model`：查看猫猫当前使用的 llm 模型
- `/memory`：查看猫猫当前的记忆内容

考虑到魔搭平台的免费 api 并未在文档中明确说明提供 tools_calling 接口，因此我们使用了让 llm 回复 json 数据的方式实现核心的 agent 功能，已适配尽量多的模型接口。魔搭 api 理论上有每日 2000 次免费调用额度，但由于每个独立模型还有次数限制，我们会轮用多个模型进行对话，具体参考 `src\plugin-neko-assist\model-scope.ts` 文件实现。

此外猫猫会把长期记忆内容保存在 `memory.json` 中，可根据需要查看与修改。

猫猫的系统提示词存放在 `system-prompts.md` 文件中，可根据需要调整其中内容，但注意不要修改返回的 JSON 格式。

## corn-task

实现定时任务功能，内部使用 [`node-schedule`] 库实现定时任务调度，提供以下指令：

- `/corn-create <name> <type> <time> <desc>`：创建定时触发的任务，`<name>` 为唯一的任务名称字符串（不能包含空白字符），`<desc>` 为任务描述，任务触发后会自动触发猫猫的 llm 回复
  - 当 `<type>` 为 at 时，表示创建一个在指定时间点触发的一次性定时任务，此时 `<time>` 为一个 YYYY-MM-DD HH:mm 格式的时间字符串
  - 当 `<type>` 为 corn 时，表示创建一个周期性触发的定时任务，此时 `<time>` 为一个 node-schedule 支持的 corn 表达式（\* \* \* \* \* \* 格式）
- `/corn-delete <name>`：删除指定名称的定时任务
- `/corn-list`：查看当前所有定时任务

定时任务的相关信息会持久化保存在 `corn.json` 文件中，注意文件的更新存在一分钟延迟。

## ai-tts

实现语音回复功能，提供如下指令：

- `/tts <音源> <文本内容>`：将文本转换为AI语音发送，音源参数可省略
- `/tts-speaker`：获取可用的音源列表

内部实现中使用免费的 `https://api.milorapart.top/apis/AIvoice` 接口实现语音回复功能。

## baidu-web-search

使用百度提供的搜索接口进行网络搜索服务，提供如下指令：

- `/web-search <搜索内容>`：使用百度搜索接口进行搜索

内部实现中使用 `https://qianfan.baidubce.com/v2/ai_search/chat/completions` 接口实现搜索能力。

虽然接口每日有 200 次免费额度，但搜索结果大多为百家号，感觉不是很好用。

## epic-free

查询当前 Epic 游戏商城的免费游戏，提供如下指令：

- `/epic-free`：查询当前 Epic 免费游戏，该指令没有参数

内部实现中使用免费的 `https://api.milorapart.top/apis/free` 接口获取免费游戏信息。

## hajimi-music

发送一段随机的哈吉米音乐，提供如下指令：

- `/哈基米`：发送一段随机的哈吉米音乐，该指令没有参数

内部实现中使用 `http://api.ocoa.cn/api/hjm.php` 接口获取音乐链接。

## image-recognize

使用 AI 识别图片内容，以文本形式描述，提供如下指令：

- `/识图 <图片>`：使用AI识别图片内容，以文本形式描述

如果当前消息没有提供图片，会尝试从最近 5 条消息中查找发送者的图片。

内部实现中使用 `https://api.milorapart.top/apis/airecognizeimg` 接口实现图片识别功能。

## jmcomic

下载 JM 本子并以 PDF 格式发送，提供如下指令：

- `/jm-album <album_id>`：下载jm本子，以pdf格式发送

内部实现中使用 Python 脚本调用 [`jmcomic`](https://github.com/hect0x7/JMComic-Crawler-Python) 库实现本子下载。

## mihoyo-checkin

执行米游社崩坏：星穹铁道的每日签到，提供如下指令：

- `/崩铁签到 <cookie>`：执行米游社崩坏：星穹铁道每日签到

内部实现中直接调用米游社 API 进行签到操作，支持多个账号的签到。

## kuro-checkin

进行库街区签到，提供如下指令：

- `/kuro-checkin <token>`：进行库街区签到

内部实现中使用 Python 脚本 [kuro-autosign](https://github.com/mxyooR/Kuro-autosignin) 进行签到操作。

## manbo-tts

将文本转换为曼波语音发送，提供如下指令：

- `/曼波 <文本内容>`：将文本转换为曼波语音发送

内部实现中使用 `https://api.milorapart.top/apis/mbAIsc` 接口实现语音生成功能。
