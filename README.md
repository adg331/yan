# yan · 小小探索家

儿童教育互动网页应用集。每个应用位于独立目录，根目录为应用入口。

## geo · 中国地理探险

面向 iPad 横屏设计的纯静态中国地理学习应用，无第三方运行时依赖。

| 玩法 | 内容 |
| --- | --- |
| 省份拖拽 | 中国 34 个省级行政区；地图初始无省名；右侧卡片按拼音排序；拖对后嵌入省名，简称闪现 3 次，播放成功音效和粒子特效 |
| 第 2 关：省名配省会 | 省名与省会 / 首府两列配对；每屏最多 6 对，共 6 批；省名按拼音排列、答案打乱；支持拖线或点击 |
| 第 3 关：省名配简称 | 省名与简称两列配对；批次可直接跳转并显示完成标记；与第 2 关分别保存进度 |
| 通关 | 三关各有通关动画、音效和重新开始入口 |
| 收藏奖励 | 任意玩法完整通关一轮，自动获得一张未拥有的名枪收藏卡；可选择心愿奖励，反复通关、逐辑收藏 |

- 支持 Pointer Events 触屏拖拽和鼠标，也可点击卡片后点击区域作答。
- 京津、上海、港澳提供无省名的放大辅助区，南海诸岛另有附图。
- 三关进度、配对批次、卡片随机顺序和静音设置保存在当前浏览器的 localStorage。
- 没有登录、广告、统计代码或儿童信息采集。
- 连连看每屏最多 6 对，支持 iPad 横屏与窄屏布局；尚未进行 iPad 实机检查。
- 音效由 Web Audio 合成，首次触摸后启用；系统音量和 iPad 系统设置也会影响实际播放。
- 候选区按普通话汉语拼音排序；山西与陕西忽略声调后拼音相同，山西在前。

## 重复挑战与名枪收藏

- 每完成一轮 34 组挑战获得一张卡；三关都能领奖。提前重开不会发奖，同一轮刷新或反复查看奖励不会重复发奖。
- 首辑包含 AK-47、M4A1、MP5、Steyr AUG、FAMAS F1、FN P90、FN SCAR-L、G36、GLOCK 19、Desert Eagle、AW · Psg 90、M16A1 共 12 款不同型号。
- 每辑内奖励不重复。集齐后继续解锁银辉、金边、星空及后续逐辑编号的纪念卡；可以一直重复练习并获得新的收藏版本。
- “名枪收藏”展示已获得卡片与待解锁轮廓，可指定当前辑中未拥有的型号作为心愿奖励。奖励卡面配色与边框发生变化，实物照片保持原样。
- 重新挑战保留收藏；连连看每轮重新打乱排列。8 / 16 / 24 组的探索星只标记进度，完整通关才获得收藏卡。
- 收藏使用独立的 `yan.geo.collection.v1` localStorage 记录；地理进度保留原键，加入稳定轮次 ID，防止动画中断或刷新时重复发奖。旧三列连连看的连线进度分别迁移到省会关和简称关；已完成的旧轮次共享原奖励记录，避免拆关后重复发奖。
- 收藏仅保存在当前浏览器中，清理站点数据、更换设备或切换到独立存储环境可能无法保留；没有账号同步。

### 奖励图片与资料

图片均为有授权信息的 Wikimedia Commons 实物照片，随项目保存，运行时不依赖第三方图片站。作者、许可证及原始来源逐项记录在 [credits.json](geo/assets/rewards/credits.json)，卡片详情中也提供署名、许可证和来源链接。各图片保留其原有许可证；项目仅按展示尺寸缩放，不修改实物图像。

型号与外形参考 Commons 对应文件描述及 [H&K MP5](https://www.heckler-koch.com/en/Products/Military%2520and%2520Law%2520Enforcement/Submachine%2520guns/MP5)、[Steyr AUG](https://www.steyr-arms.com/en/military-law-enforcement/assault-rifles/aug-a1/)、[FN P90](https://fnherstal.com/en/defence/portable-weapons/fn-p90/)、[GLOCK 品牌历史](https://eu.glock.com/en/Explore-GLOCK/GLOCK-masterpieces)等公开资料。卡片展示型号、来源地区及外形知识。

## 添加到 iPad 主屏幕

1. 使用 Safari 打开 <https://adg331.github.io/yan/geo/>。
2. 点击“分享”→“添加到主屏幕”。如出现“作为网页 App 打开”选项，保持开启，再点“添加”。
3. 主屏幕名称为“geo 地理”，图标为绿色折叠地图与金色定位标记；从图标打开时采用独立窗口模式。

图标源文件为 `geo/icon.svg`，PNG 位于 `geo/icons/`，已提供 Apple touch icon 的 152 / 167 / 180 像素版本及 192 / 512 / 1024 像素版本。无需安装 App Store 应用；目前首次打开和加载页面仍需要联网。

## 本地开发

需要通过 HTTP 访问，不能直接双击打开 ES module 文件。

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

- 应用入口：<http://127.0.0.1:4173/>
- geo：<http://127.0.0.1:4173/geo/>

## 验证

```sh
npm ci --ignore-scripts
npm test
```

测试执行真实应用代码，覆盖 34 个区域、拖放重试、小区域放大、双向连线、全部通关、模式切换、进度恢复、静音和异常存储，以及连续 120 次奖励不重复、跨玩法领奖、刷新不重复发奖、升级迁移和心愿奖励。jsdom 不提供真实浏览器布局、触摸硬件或音频输出，iPad Safari 的视觉和实机音效仍需检查。

## GitHub Pages 发布

仓库 Settings → Pages → Deploy from a branch → `main` / `(root)` → Save。

启用后，geo 地址为 <https://adg331.github.io/yan/geo/>。所有资源使用相对路径，兼容项目子路径。

## 教学内容与资料来源

- [中国政府网资料：中华人民共和国行政区划](https://www.locpg.gov.cn/2022-06/07/c_1211652713.htm)：34 个省级行政区与省会、首府概念。
- [国家中小学智慧教育平台：地理教材第一章](https://r1-ndr.ykt.cbern.com.cn/edu_product/esp/assets/1a27180c-f282-4d45-b3ce-138c72905df4.pkg/pdf.pdf)：省级区域名称、简称、行政中心对照表。
- [上海外语教育出版社《中国概况》](https://ecdn.flebm.com/9787544652933.pdf)：常用简称和别称对照表。
- 内蒙古简称按教材使用“内蒙古”；其他具有多种常用简称的地区合并在同一张卡片，如四川“川 / 蜀”。
- 直辖市不设省会，第三列使用市名并标注“直辖市”；香港和澳门的第三列分别标注“香港不设省会”“澳门不设省会”。自治区行政中心为首府。

## 地图数据

- [阿里云 DataV 地理工具](https://datav.aliyun.com/portal/school/atlas/area_selector)
- [下载来源](https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json)，取得于 2026-11-17。
- `geo/data/map.js` 由该文件进行 Albers 投影并保留两位屏幕坐标生成，包含 34 个省级行政区图形及原始海上断续线。数据来源的权利归原权利人所有，仓库未对该数据附加许可证。
- 地图为交互教学示意，不用于测绘。

## 文件结构

```text
index.html               应用集首页
geo/index.html           游戏页面
geo/styles.css           响应式布局与动画
geo/app.js               拖拽、连线、音效、本地进度
geo/collection.js        收藏规则、奖励去重、逐辑解锁
geo/collection-ui.js     收藏馆、心愿选择与通关卡片
geo/collection.css       收藏与奖励界面
geo/data/provinces.js    34 组教学内容
geo/data/map.js          本地地图几何数据
geo/data/rewards.js      12 款收藏图鉴及图片署名
geo/assets/rewards/      本地实物图片与授权记录
```
