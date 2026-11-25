# 回声星 · 外部建模替换清单

用 AI 建模工具生成 GLB 模型，替换代码里拼出来的低模。清单按优先级排序：**近看最显低模、出现最频繁、最能体现风格**的放前面。每一项都写了尺寸、数量、面数、贴图、原点和朝向，提示词可以直接复制（中文、英文各一份）。

导出规范和文件放在哪，见文末。

## 优先级怎么排的

| 档 | 含义 | 项数 |
| --- | --- | --- |
| **P0** | 城市里镜头最常凑近、而且会被点开看的东西。替换后观感提升最大 | 8 |
| **P1** | 城市的地标，和其他六个模块最有代表性的「主角」 | 12 |
| **P2** | 各模块的植被和散件，量大但单个不起眼 | 12 |

建议按 P0 → P1 → P2 的顺序一批批生成。每批先做一两个试接进去，确认比例、朝向和观感对了，再批量生成。

## 通用风格（每条提示词后面都可以追加）

> 中文：风格写实偏绘画感，色调褪色、安静、带一点哀伤；表面有真实的风化、锈迹、苔藓和灰尘；不要卡通、不要塑料感、不要过饱和。
>
> English: Realistic with a painterly touch, faded and melancholic palette; physically based surfaces with genuine weathering, rust, moss and dust; not cartoonish, not plastic, not oversaturated.

---

## P0 · 城市近景

### 1. 拾遗者小机械 `ruin-city/scavenger-bot`
- **用途**：废墟里游荡的小机器人，30 只，可以点开信息卡、走近看。现在是几个球和细圆柱拼的。
- **数量**：1 个模型，3 种涂装变体（换贴图即可）。
- **尺寸**：高 2.6 米（头顶），宽约 1.8 米（含手臂）。
- **面数**：8,000 三角面；另给 LOD1 2,500。
- **贴图**：PBR，1024²（底色 / 法线 / ORM）。眼睛单独一个自发光材质，命名 `Eye`。
- **原点 / 朝向**：两脚之间的地面；面朝 +Z。
- **动画**：需要。`Walk`（1 秒循环）、`Idle`（3 秒，左右张望）、`Look`（抬头看镜头）。骨骼：躯干、头、两腿、两臂。
- **提示词（中）**：一个圆滚滚的小型废土拾荒机器人，椭圆形躯干和小球形头，头部正面一只发光的圆眼，细长的机械双腿和双臂。米黄色旧涂装大面积剥落露出锈蚀金属，关节处有油污，背后挂着一个用废料拼成的小收集袋。像是在末日后的城市里独自游荡了几十年，带着好奇和温顺的气质。
- **Prompt (EN)**: A small, round post-apocalyptic scavenger robot: oval torso, small spherical head with a single glowing round eye on the front, thin mechanical legs and arms. Old cream-colored paint heavily chipped revealing rusted metal, oil stains at the joints, a small salvage bag made of scrap hanging on its back. Feels like it has wandered a ruined city alone for decades — curious and gentle.

### 2. 雾港电车 `ruin-city/tram-car`
- **用途**：沿海岸跑的两列电车，每列两节，可以搭乘，镜头会贴着它跟拍。现在是几个方盒子。
- **数量**：1 个车厢模型，2 种涂装（灰绿、奶黄）。
- **尺寸**：长 9 米、宽 2.5 米、车顶高 3.1 米（不含集电杆），集电杆再高 2.5 米。
- **面数**：15,000；LOD1 4,000。
- **贴图**：PBR，2048²。车窗玻璃单独材质 `Glass`（夜里要亮），侧门单独一个节点 `Door`（代码会开关它）。
- **原点 / 朝向**：两轨中间、轨面高度、车厢中点；车头朝 +Z。左侧（-X）是上下客的门。
- **动画**：不需要（门由代码平移）。
- **提示词（中）**：一节上世纪初欧洲港口小城的老式有轨电车车厢，木质与钢板混合车身，圆弧形车顶，侧面一排上下分格的木框车窗，车顶一根斜伸的集电杆，车身下沿有深色裙板和转向架。漆面是褪色的灰绿色，带手绘的线路编号和细金线装饰，边角磨损、轻微锈迹，车窗玻璃略带雾气。
- **Prompt (EN)**: An early-20th-century tram car from a small European harbor town: mixed wood and steel body, arched roof, a row of wood-framed divided windows along the side, a single angled trolley pole on the roof, dark skirt panels and bogies below. Faded grey-green paint with hand-painted route number and thin gold pinstripes, worn edges, light rust, slightly fogged window glass.

### 3. 废墟高楼「断顶」套件 `ruin-city/tower-top-*`
- **用途**：高楼本身是代码按尺寸生成的（宽 13–32 米、高 14–215 米，数量约 200 栋），整栋换 GLB 不现实。最显低模的是**楼顶断口**和**撕开的楼角**，做成可以盖在楼顶、嵌在楼角的套件。
- **数量**：楼顶断口 4 种、楼角撕口 3 种、外露楼板带钢筋的断边 3 种，共 10 个。
- **尺寸**：楼顶断口 16×16 米、高 4–12 米（代码会按楼宽缩放）；楼角撕口 8×8×10.5 米（三层楼高，层高 3.5 米）；断边 8×1×0.4 米。
- **面数**：每个 4,000–8,000。
- **贴图**：PBR，2048²，**要能和现有混凝土立面接缝**：灰白混凝土、4 米一格的窗、3.5 米层高。
- **原点 / 朝向**：断口和撕口的原点在底面中心，外立面朝 +Z 和 +X。
- **动画**：不需要。
- **提示词（中）**：一栋废弃混凝土高楼被折断的顶部残段，参差不齐的断口，几层楼板像饼干一样断在不同长度，断口边缘伸出弯折下垂的生锈钢筋，碎块和瓦砾堆在楼板上，缝里长出青苔和小灌木。灰白色的混凝土，带雨水冲刷的竖向污痕，窗洞空着、玻璃碎尽。风格接近《尼尔：机械纪元》里被自然吞没的城市废墟。
- **Prompt (EN)**: The snapped-off top of an abandoned concrete high-rise: jagged broken silhouette, several floor slabs broken off at different lengths like crackers, bent rusty rebar sticking out and drooping from the broken edges, rubble on the slabs, moss and small shrubs growing from cracks. Pale grey concrete with vertical rain-streak stains, empty window openings with all glass gone. Nature-reclaimed post-apocalyptic city ruin in the spirit of a melancholic action RPG.

### 4. 废弃汽车 `ruin-city/car-wreck-*`
- **用途**：街上和高架桥上的废车，约 300 辆。现在是两个方盒子叠起来。
- **数量**：4 种车型（小轿车、厢式货车、公交车、三轮小货车）。
- **尺寸**：轿车 4.2×1.8×1.4 米；厢货 5.5×2.1×2.4 米；公交 11×2.5×3 米；三轮 3.2×1.4×1.6 米。
- **面数**：每种 3,000（公交 5,000）；LOD1 800。
- **贴图**：PBR，1024²，4 辆车共用一张图集更好。
- **原点 / 朝向**：车底中心落地；车头朝 +Z。
- **动画**：不需要。
- **提示词（中）**：一辆在废墟里放了几十年的老式小轿车，车漆大面积褪色、锈穿，轮胎瘪了或者没了，车窗全碎，车顶和引擎盖上落满灰尘和落叶，藤蔓从车门缝和车轮里长出来缠住车身。
- **Prompt (EN)**: A vintage compact car abandoned in a ruined city for decades: paint faded and rusted through, tires flat or missing, all windows shattered, dust and dead leaves on the roof and hood, vines growing out of the door gaps and wheel wells wrapping the body.

### 5. 城市阔叶树与松树 `ruin-city/tree-oak-*`、`tree-pine-*`
- **用途**：城市和周围山上的树，几千棵（实例化）。现在是几个多面体球，近看最假。
- **数量**：阔叶树 3 种、松树 2 种、灌木 2 种。
- **尺寸**：阔叶树高 7 米、冠幅 5 米；松树高 10 米；灌木直径 2 米（代码按 0.5–1.7 倍缩放）。
- **面数**：阔叶树 / 松树 3,000（叶片用带透明的面片），LOD1 600；灌木 800。
- **贴图**：PBR，1024²；叶片底色贴图带 alpha（alpha 裁切，不要半透明）。
- **原点 / 朝向**：树根贴地；无朝向要求。
- **动画**：不需要（代码用顶点着色器做风吹）。树干和叶片分两个材质，命名 `Bark`、`Leaf`。
- **提示词（中）**：一棵适合游戏实时渲染的阔叶树，树干微微弯曲，分成三四根主枝，树冠蓬松不规则、带几处空隙，叶片用透明面片做，颜色是略带灰的暖绿。树干有苔藓。
- **Prompt (EN)**: A game-ready broadleaf tree for real-time rendering: slightly curved trunk splitting into three or four main branches, loose irregular canopy with a few gaps, leaves as alpha-cutout cards, slightly greyish warm green. Moss on the trunk.

### 6. 雾港小楼 `ruin-city/town-house-*`
- **用途**：沿山坡叠起来的雾港老城，约 1,000 栋。现在是方盒子贴图加三棱柱屋顶。
- **数量**：6 种（2–5 层，平面 7.5–10.5 × 7–9.5 米）。代码会在 ±10% 内缩放。
- **尺寸**：例如 9×8 米平面、檐口高 10 米、屋脊高 13.5 米。
- **面数**：每栋 6,000；LOD1 1,500（远景用）；LOD2 可以就是现在的方盒子。
- **贴图**：PBR，2048²，**6 栋共用一张图集**；夜灯用自发光贴图 `Emissive`（窗户亮，其他黑），代码会按户控制亮灯先后。
- **原点 / 朝向**：底面中心（底面比地面低 0.5 米，便于插进坡地）；正面朝 +Z（朝海）。
- **动画**：不需要。
- **提示词（中）**：一栋地中海与北欧混合风格的港口小镇民居，四层，灰泥外墙是褪色的奶油色，白色窗框、两侧有彩色木百叶窗，窗台上摆着花箱，二楼一个铁栏杆小阳台，一楼是带条纹雨棚的小店门面，红陶筒瓦坡屋顶上有一根砖烟囱。墙面有剥落露出的砖、雨水痕和一点青苔。
- **Prompt (EN)**: A harbor-town house blending Mediterranean and Nordic styles, four storeys, faded cream stucco walls, white window frames with colored wooden shutters on both sides, flower boxes on the sills, a small wrought-iron balcony on the second floor, a ground-floor shopfront with a striped awning, a red terracotta barrel-tile pitched roof with a brick chimney. Peeling stucco revealing brick, rain stains and a little moss.

### 7. 雾港行人 `ruin-city/walker`
- **用途**：街上散步、候车、雨天撑伞的行人，几十个，近看会看到。
- **数量**：1 个基础人形，4 种服装贴图。
- **尺寸**：高 1.7 米。
- **面数**：4,000；LOD1 1,000。
- **贴图**：PBR，1024²。伞做成单独节点 `Umbrella`，代码控制显示。
- **原点 / 朝向**：两脚之间地面；面朝 +Z。
- **动画**：需要。`Walk`、`Idle`、`Run`（躲雨）、`HoldUmbrella`。标准人形骨骼（Mixamo 兼容最好）。
- **提示词（中）**：一位生活在雾气笼罩的港口小镇里的居民，穿着朴素的长外套和围巾，戴一顶旧毡帽，手里提着布包。服装是褪色的大地色系，整体比例写实、略风格化。
- **Prompt (EN)**: A resident of a foggy harbor town wearing a plain long coat and scarf, an old felt hat, carrying a cloth bag. Faded earth-tone clothing, realistic proportions with slight stylization.

### 8. 码头杂件包 `ruin-city/dock-props`
- **用途**：仓库门前的货箱、木桶、系缆桩、渔网、路灯、长椅、站台雨棚。
- **数量**：货箱 3 种、木桶 2 种、系缆桩 1、路灯 1、长椅 1、电车站雨棚 1。
- **尺寸**：货箱 1.2–1.6 米见方；木桶直径 0.8、高 1.1 米；路灯高 4.4 米；雨棚 22×3.6 米、高 4.2 米。
- **面数**：小件 300–1,500；雨棚 4,000。
- **贴图**：PBR，共用一张 2048² 图集。路灯灯罩单独材质 `Lamp`（夜里亮）。
- **原点 / 朝向**：底面中心；路灯灯头朝 +Z。
- **动画**：不需要。
- **提示词（中）**：一组旧港口码头的道具：风化的木货箱、铁箍木桶、铸铁系缆桩、带玻璃灯罩的老式铸铁路灯、木条长椅、铁架玻璃顶的电车站雨棚。全部带海风侵蚀的锈迹、盐渍和磨损。
- **Prompt (EN)**: A set of old harbor dock props: weathered wooden crates, iron-banded wooden barrels, a cast-iron mooring bollard, a vintage cast-iron street lamp with a glass lantern, a slatted wooden bench, a tram stop shelter with an iron frame and glass roof. All with sea-salt corrosion, rust and wear.

---

## P1 · 地标与各模块的主角

### 9. 锈蚀摩天轮 `ruin-city/ferris-wheel`
- **用途**：废墟边缘的地标，单个。
- **尺寸**：轮径 68 米，轮心离地 40 米，宽 4.4 米（两片轮圈），18 根辐条、约 13 个吊厢（缺了几个）。
- **面数**：60,000。
- **贴图**：PBR，2048²。
- **原点 / 朝向**：两组支腿中间的地面；轮面平行于 XY 平面（轮轴沿 Z）。
- **动画**：不需要（静止，代码可以让它整体轻微晃动）。
- **提示词（中）**：一座废弃游乐园里的巨大锈蚀摩天轮，两片钢结构轮圈和密集的辐条，A 字形的钢支腿，挂着一圈老式圆顶吊厢，有几个吊厢已经掉了或歪斜，藤蔓从底部爬上轮圈垂下来。整体锈成深橙褐色，残存一点褪色的油漆。
- **Prompt (EN)**: A giant rusted Ferris wheel in an abandoned amusement park: twin steel rims with dense spokes, A-frame steel support legs, a ring of vintage domed gondolas with a few missing or hanging askew, vines climbing from the base and draping from the rim. Rusted deep orange-brown with traces of faded paint.

### 10. 飞艇 `ruin-city/airship-*`
- **用途**：城市上空三艘飞艇，可以搭乘，会靠上系留塔。
- **数量**：大（56 米）、中（38 米）、小（30 米）三种，或者一种按比例缩放。
- **尺寸**：大的长 56 米、直径 14 米，吊舱长 12 米。
- **面数**：20,000。
- **贴图**：PBR，2048²。螺旋桨单独节点 `Prop`（代码转它），吊舱窗 `Glass`。
- **原点 / 朝向**：气囊中心；船头朝 +Z。
- **动画**：不需要。
- **提示词（中）**：一艘蒸汽朋克风格的小型客运飞艇，帆布蒙皮的雪茄形气囊上有缝线和补丁，十字形尾翼，气囊下方吊着一个木质与黄铜的长条吊舱，带一排圆窗和两侧的螺旋桨。米白色帆布已经泛黄，金属件有铜绿。
- **Prompt (EN)**: A small steampunk passenger airship: cigar-shaped canvas envelope with visible seams and patches, cruciform tail fins, a long wooden-and-brass gondola slung underneath with a row of round windows and propellers on both sides. Off-white canvas yellowed with age, verdigris on the metal fittings.

### 11. 雾港渡轮与渔船 `ruin-city/boat-*`
- **数量**：渡轮 1、渔船 1、观光艇 1、远洋货轮 1。
- **尺寸**：渔船长 10 米；渡轮 20 米；货轮 45 米。
- **面数**：渔船 6,000；渡轮 15,000；货轮 25,000。
- **贴图**：PBR，2048²。
- **原点 / 朝向**：水线中心；船头朝 +Z。
- **动画**：不需要（代码让它随浪起伏）。
- **提示词（中）**：一艘北欧港口的旧木质渔船，船身漆成深绿色，白色小驾驶舱，船头挂着旧轮胎当护舷，甲板上堆着渔网、浮球和绳索，船身有海水留下的盐渍和锈迹。
- **Prompt (EN)**: An old wooden Nordic harbor fishing boat: hull painted dark green, small white wheelhouse, old tires hung as fenders at the bow, nets, floats and coiled ropes on deck, salt stains and rust streaks on the hull.

### 12. 断顶白塔 `ruin-city/white-tower-top`
- **用途**：北边山顶 600 米高的白塔，只替换**断顶和悬浮的碎块**（塔身是简单的六棱锥，远看足够）。
- **尺寸**：断口直径 44 米，残段高 60 米；9 块悬浮碎块，6–18 米。
- **面数**：断顶 30,000；碎块每块 2,000。
- **贴图**：PBR，2048²；发光接缝用自发光贴图，青色。
- **原点 / 朝向**：断顶底面中心；碎块各自中心。
- **提示词（中）**：一座极高的白色未来主义巨塔被折断的顶端，光滑的白色外壳上有一条条发着青光的接缝，断口处的外壳像蛋壳一样碎裂，露出里面层层叠叠的结构骨架，几块碎片悬浮在断口上方。干净、神秘、带宗教感。
- **Prompt (EN)**: The broken summit of an immensely tall white futuristic tower: smooth white shell with glowing cyan seams, the shell shattered like eggshell at the break revealing layered internal framework, several fragments floating above the break. Clean, mysterious, almost sacred.

### 13. 横谷巨人 `gobi-rift/colossus`（模块 2 戈壁大裂谷）
- **用途**：卡在裂谷两岸之间的远古巨型机械残骸，模块的主角，单个。
- **尺寸**：全长约 350 米（脊柱 280 米），躯干直径约 20 米，双腿搭在西岸，右臂垂进裂谷。**超过 700 米的单件会在球面上翘起，这个尺寸可以**。
- **面数**：150,000（拆成 躯干、头、左右臂、骨盆和腿 五个节点，方便摆放）。
- **贴图**：PBR，4096²（或 2048² × 3 张分区）；胸腔里的反应炉 `Core` 用自发光。
- **原点 / 朝向**：骨盆中心；头朝 -X。
- **提示词（中）**：一具倒卧的远古巨型人形机械的残骸，长三百多米，裸露的脊柱和弧形肋骨像鲸鱼骨架，背上一片片弧形装甲板部分剥落，肋骨之间有一颗还在发着暗橙色光的反应炉核心，管线从身体垂下。金属是风化的铁锈色和古铜色，关节和低洼处积满红沙。
- **Prompt (EN)**: The wreck of an ancient colossal humanoid machine lying on its side, over 300 m long: exposed spine and curved ribs like a whale skeleton, curved armor plates on the back partly torn away, a reactor core still glowing dull orange between the ribs, cables hanging from the body. Weathered rust and bronze metal, red sand drifted into joints and hollows.

### 14. 沙中巨手与沉睡巨首 `gobi-rift/sand-hand`、`gobi-rift/giant-head`
- **尺寸**：巨手露出沙面约 60 米高；巨首直径约 80 米，侧躺半埋。
- **面数**：各 60,000。
- **贴图**：PBR，2048²；巨首的眼睛 `Eye` 用自发光。
- **原点 / 朝向**：沙面高度的中心点；手掌朝 +Z；脸朝 +Z。
- **提示词（中）**：一只从红色沙漠里伸出来的巨大机械手，手腕以下埋在沙里，五指半张开朝向天空，每根手指由装甲关节节节相连，指缝里卡着沙和碎石，表面锈蚀、被风沙磨亮。
- **Prompt (EN)**: A gigantic mechanical hand rising out of a red desert, buried below the wrist, five fingers half-open toward the sky, each finger made of armored segmented joints, sand and gravel lodged between the fingers, surfaces rusted and sand-blasted to a dull sheen.

### 15. 沉没森林的锈蚀列车 `sunken-wetland/train-car-*`（模块 3）
- **用途**：被树根抬起、半泡在水里的列车，约 6 节。
- **数量**：车头 1、客车厢 1、货车厢 1。
- **尺寸**：每节长 20 米、宽 3 米、高 4 米。
- **面数**：每节 12,000。
- **贴图**：PBR，2048²。
- **原点 / 朝向**：车底中心；车头朝 +Z。
- **提示词（中）**：一节被热带雨林吞没的老式铁路客车厢，车身锈成橙褐色、局部锈穿，车窗全碎，粗大的气根从窗口穿进穿出缠住整节车厢，车顶长满蕨类和苔藓，下半截泡在黑色的静水里。
- **Prompt (EN)**: An old railway passenger carriage swallowed by a flooded rainforest: body rusted orange-brown and rotted through in places, all windows broken, thick aerial roots threading in and out of the windows and wrapping the carriage, ferns and moss covering the roof, the lower half submerged in still black water.

### 16. 被树根吞没的石庙 `sunken-wetland/temple`
- **用途**：湿地中心的神庙岛，单个地标。
- **尺寸**：基座 60×60 米，主塔高 35 米。
- **面数**：100,000。
- **贴图**：PBR，2048² × 2。
- **原点 / 朝向**：基座底面中心；正门朝 +Z。
- **提示词（中）**：一座被巨树根系吞没的古代石砌神庙，类似吴哥塔普伦寺，层层收进的砂岩塔、回廊和门洞，粗大的白色树根像融化的蜡一样从塔顶流淌下来包住墙体，石块被挤得错位、坍塌，表面长满青苔，部分泡在水中。
- **Prompt (EN)**: An ancient sandstone temple engulfed by giant tree roots, in the spirit of Ta Prohm: stepped towers, galleries and doorways, massive pale roots flowing down from the tower tops like melted wax and gripping the walls, stones pushed out of place and collapsing, covered in moss, partly flooded.

### 17. 浮空岛上的白石废墟 `sky-isles/ruin-kit`（模块 4）
- **数量**：残柱 3 种、拱门 1、圆殿残墙 1、断塔 1。
- **尺寸**：残柱高 5–11 米、直径 1.8 米；拱门宽 13 米、高 14 米；圆殿直径 16 米；断塔高 30 米。
- **面数**：残柱 2,000；拱门 6,000；圆殿和断塔 15,000。
- **贴图**：PBR，2048² 图集。
- **原点 / 朝向**：底面中心；拱门开口朝 +Z。
- **提示词（中）**：一组漂浮在云海上的古代白色大理石神殿废墟：带凹槽的残柱、半圆拱门、只剩半圈墙的圆形神殿、一座断成两截的细高石塔。石头洁白但有风化的裂纹和青苔，边缘挂着垂下的藤蔓。
- **Prompt (EN)**: A set of ancient white marble temple ruins floating above a sea of clouds: fluted broken columns, a round arch, a circular rotunda with only half its wall left, a slender stone tower snapped in two. White stone with weathered cracks and moss, vines hanging from the edges.

### 18. 铁链与吊桥 `sky-isles/chain-link`、`sky-isles/rope-bridge-segment`
- **用途**：把浮岛拴在台地上的巨型铁链（实例化几千节），和岛与岛之间的吊桥。
- **尺寸**：链环长 2.9 米、宽 1.8 米；吊桥每段长 2 米、宽 2.4 米。
- **面数**：链环 400；吊桥段 1,200。
- **贴图**：PBR，1024²。
- **原点 / 朝向**：链环中心，长轴沿 Y；桥段中心，走向沿 Z。
- **提示词（中）**：一节巨大的锻铁锁链环，粗糙的手工锻造痕迹，表面锈蚀起皮。/ 一段木板吊桥，绳索扶手，木板有缺失和磨损。
- **Prompt (EN)**: A single giant wrought-iron chain link with rough hand-forged marks and flaking rust. / One segment of a wooden rope bridge with rope handrails, some planks worn or missing.

### 19. 熔炉守卫 `volcano-forge/guardian`（模块 5）
- **用途**：守门台上跪着的巨型机械守卫，2–4 尊。
- **尺寸**：跪姿高约 75 米，宽 50 米，双手按在插进地里的巨剑上。
- **面数**：80,000。
- **贴图**：PBR，2048²；胸口的核 `Core` 自发光（橙红）。
- **原点 / 朝向**：着地膝盖与前脚之间的地面；面朝 -Z。
- **提示词（中）**：一尊跪着的远古巨型机械守卫，右膝着地、左脚踏前，双手交叠按在插进地面的巨剑剑柄上，桶形胸腔中间一颗发着橙红色光的核心，圆润厚重的肩甲和头盔，像被时间磨圆的青铜和铸铁。表面有熔岩烤出的黑色焦痕和硫磺黄的结晶。
- **Prompt (EN)**: A kneeling ancient colossal mechanical guardian: right knee down, left foot forward, both hands resting on the hilt of a giant sword planted in the ground, a barrel chest with a glowing orange-red core at its center, heavy rounded pauldrons and helm like bronze and cast iron worn smooth by ages. Black scorch marks from lava and sulfur-yellow crystal deposits.

### 20. 坠毁巨舰的断面 `ice-wreck/hull-break-*`（模块 6）
- **用途**：断成三截的巨舰（全长 1.3 公里），船体本身是代码按截面生成的。最显低模的是**两处断口**和**舰首**。
- **数量**：断口 2、舰首 1、尾翼 1。
- **尺寸**：船体截面宽约 90 米、高约 60 米；舰首长 120 米；尾翼高 80 米。
- **面数**：断口 50,000；舰首 80,000；尾翼 30,000。
- **贴图**：PBR，2048² × 2；舷窗和引擎口用自发光。
- **原点 / 朝向**：断面中心；船身沿 +X。
- **提示词（中）**：一艘科幻巨型飞船断裂的船体截面，外层是拼接的灰白色装甲蒙皮，断口处纵梁、肋框、管道和电缆参差不齐地戳出来、往下耷拉，内部能看见一层层甲板和走廊，断面上结着冰霜和积雪。
- **Prompt (EN)**: The torn cross-section of a colossal sci-fi starship hull: outer skin of patched grey-white armor plating, longitudinal beams, frames, pipes and cables jutting out raggedly and drooping at the break, layered decks and corridors visible inside, frost and drifted snow on the broken face.

---

## P2 · 植被与散件

| # | 名称 / 路径 | 模块 | 数量 | 尺寸（米） | 面数 | 提示词（中） | Prompt (EN) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 21 | 平顶金合欢 `gobi-rift/acacia` | 2 | 2 种 | 高 7、冠幅 9 | 3,000 | 东非草原上的平顶金合欢树，歪斜分叉的树干，顶上一层扁平如伞的稀疏树冠 | An East African flat-topped acacia: leaning forked trunk, a flat umbrella-like sparse canopy |
| 22 | 棕榈 `gobi-rift/palm` | 2 | 2 种 | 高 12 | 2,500 | 沙漠绿洲里的海枣棕榈，略弯的环纹树干，一圈下垂的羽状叶，底下挂着枯叶 | A date palm in a desert oasis: slightly curved ringed trunk, a crown of drooping pinnate fronds, dry fronds hanging below |
| 23 | 沙埋铁路小镇房屋 `gobi-rift/rail-house-*` | 2 | 3 种 | 8×6、高 5 | 4,000 | 被流沙埋了一半的土坯铁路小站房屋，木门窗框，屋顶有铁皮补丁，沙堆到窗台 | A half-buried adobe railway-town house: wooden door and window frames, tin patches on the roof, sand drifted up to the sills |
| 24 | 湿地古树 `sunken-wetland/ancient-tree` | 3 | 2 种 | 高 45、冠幅 40 | 25,000 | 从积水里长出的巨大雨林古树，板状根和气根垂入水中，枝干挂满垂苔和附生植物 | A giant rainforest tree rising from floodwater: buttress roots and aerial roots dropping into the water, branches draped with hanging moss and epiphytes |
| 25 | 布里蒂棕榈 `sunken-wetland/buriti-palm` | 3 | 2 种 | 高 18 | 2,500 | 亚马逊沼泽里细高的布里蒂棕榈，扇形大叶，冠下挂一圈枯叶 | A tall slender buriti palm of the Amazon swamps: large fan-shaped leaves, a skirt of dead leaves below the crown |
| 26 | 王莲与芦苇 `sunken-wetland/water-plants` | 3 | 王莲 1、芦苇丛 2 | 王莲直径 2 | 400 / 800 | 浮在黑水面上的王莲叶，边缘翻起；一丛细长的芦苇 | A giant water lily pad with upturned rim floating on black water; a clump of slender reeds |
| 27 | 浮岛松树和阔叶树 `sky-isles/tree-*` | 4 | 3 种 | 高 8–10 | 2,500 | 长在悬崖边被风吹歪的松树，根抓着岩石 | A wind-bent pine on a cliff edge with roots gripping the rock |
| 28 | 发光晶簇 `sky-isles/crystal-cluster` | 4 | 3 种 | 高 2–6 | 600 | 一簇从岩石里长出的半透明青色发光水晶 | A cluster of translucent glowing cyan crystals growing out of rock |
| 29 | 玄武岩柱与熔炉齿轮 `volcano-forge/props` | 5 | 柱 3、齿轮 2 | 柱径 2、齿轮直径 10–30 | 1,000 / 8,000 | 冰岛式六棱玄武岩柱群；锈蚀的巨型铸铁齿轮，边缘被烤得发黑 | Icelandic hexagonal basalt columns; a giant rusted cast-iron gear, edges scorched black |
| 30 | 极地科考站小屋 `ice-wreck/station-hut` | 6 | 2 种 + 无线电塔 1 | 小屋 8×5、高 4（高脚）；塔高 30 | 6,000 / 4,000 | 南极高脚科考站小屋，橙红色金属外壳，圆角窗，被积雪半埋，旁边一座桁架无线电塔 | An Antarctic research hut on stilts: orange-red metal shell, rounded windows, half-buried in snow, with a lattice radio tower beside it |
| 31 | 盐湖列柱与射电天线 `salt-mirror/pillar-*`、`dish` | 7 | 列柱 3、天线 1 | 列柱高 30–60；天线口径 25 | 8,000 / 20,000 | 横穿盐湖的巨石列柱，八角柱身刻着环带，底座结着白色盐霜；废弃的射电望远镜，碟面有破洞 | Monolithic octagonal stone pillars crossing a salt flat, carved bands on the shaft, white salt crust at the base; an abandoned radio telescope dish with holes in its surface |
| 32 | 仙人掌与盐湖列车墓地 `salt-mirror/cactus`、`train-wreck` | 7 | 仙人掌 3、机车 1、车厢 1 | 仙人掌高 3–8；机车长 15 | 1,500 / 12,000 | 柱状巨人仙人掌；锈成红褐色的蒸汽机车残骸，停在盐滩上 | A tall columnar cardon cactus; a rusted red-brown steam locomotive wreck standing on a salt flat |

---

## 导出规范

| 项 | 要求 |
| --- | --- |
| **格式** | glTF 2.0 二进制 `.glb`，一个模型一个文件，贴图打包在文件里 |
| **单位** | 米。1 单位 = 1 米，按上面写的真实尺寸导出，不要再靠缩放凑 |
| **坐标轴** | **Y 轴朝上**，右手系。各项写的「朝 +Z」是模型的正面（车头、脸、正门） |
| **原点** | 按每一项写的位置（一般是底面中心、贴地）。导出前把变换应用（Apply transforms），根节点不带旋转和缩放 |
| **材质** | PBR 金属度 / 粗糙度工作流：`baseColor`（sRGB）、`normal`、`ORM`（R=AO、G=粗糙度、B=金属度，线性）。要发光的部分单独一个材质，命名见各项 |
| **透明** | 叶片、栏杆这类用 alpha 裁切（`alphaMode: MASK`，阈值 0.5），不要用半透明混合 |
| **贴图尺寸** | 小件 1024²，主角和地标 2048²，特别大的（横谷巨人）可以 4096² 或拆几张 2048² |
| **贴图压缩** | WebP（`EXT_texture_webp`），质量 85 左右；法线贴图质量 90 |
| **网格压缩** | meshopt（`EXT_meshopt_compression`）。不用 Draco，免得多带一个解码器 |
| **LOD** | 实例化的小件（树、车、小楼）请多给一个 LOD1 文件，命名 `*_lod1.glb`，面数见各项 |
| **节点命名** | 代码要单独控制的部分用固定名字：`Door`、`Glass`、`Eye`、`Core`、`Prop`、`Umbrella`、`Lamp`、`Bark`、`Leaf` |
| **动画** | 只有标了「需要」的才做；动作名照写（`Walk`、`Idle`……），30 fps，循环动作首尾帧一致 |
| **体积** | 小件 ≤ 1 MB，地标 ≤ 8 MB，横谷巨人 ≤ 15 MB |

推荐用 [glTF-Transform](https://gltf-transform.dev/) 做最后一步：

```bash
gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress webp
```

## 文件放在哪

```
assets/models/
  ruin-city/        城市（P0 全部在这里）
    scavenger-bot.glb
    tram-car.glb
    tree-oak-1.glb  tree-oak-1_lod1.glb
    ...
  gobi-rift/
  sunken-wetland/
  sky-isles/
  volcano-forge/
  ice-wreck/
  salt-mirror/
```

- 文件名全小写、用连字符，和上面每项标的路径一致；多个变体在后面加 `-1`、`-2`。
- 每个模块目录里放一个 `credits.md`，写清是用什么工具、什么提示词生成的，便于以后重做。
- 代码这边要做的接入（加载器、按名字替换、LOD 切换）放到收到第一批模型后再做：要往 `vendor/` 里加 `GLTFLoader.js` 和 meshopt 解码器，模块里按上面的路径加载，加载失败时退回现在的程序化模型，保证流畅档和离线也能跑。
