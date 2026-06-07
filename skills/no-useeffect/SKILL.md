---
name: no-useEffect
description: "React 无 useEffect 编码规范 - 禁止直接使用 useEffect，使用替代模式代替"
category: coding
emoji: 🚫
tags:
  - react
  - useEffect
  - hooks
  - frontend
  - best-practice
---

# React 无 useEffect 编码规范

## 核心规则

**禁止直接调用 useEffect**。对于需要与外部系统同步的罕见情况，使用 `useMountEffect()`。

```typescript
export function useMountEffect(effect: () => void | (() => void)) {
  /* eslint-disable no-restricted-syntax */
  useEffect(effect, []);
}
```

## 为什么禁止 useEffect

- **脆弱性**：依赖数组隐藏了耦合关系，重构可能悄悄改变 effect 行为
- **无限循环**：容易创建 state 更新 -> 渲染 -> effect -> state 更新的循环
- **依赖地狱**：Effect 链 (A 设置状态触发 B) 是基于时间的控制流，难以追踪
- **调试困难**：经常问"为什么运行了？"或"为什么没运行？"

## 五大替代模式

### 规则 1：派生状态，而不是同步状态

大多数设置其他状态 的 effect 是不必要的，会增加额外的渲染。

```typescript
// ❌ 差：两次渲染周期 - 先是过滤后的，后是过滤前的
function ProductList() {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);

  useEffect(() => {
    setFilteredProducts(products.filter((p) => p.inStock));
  }, [products]);
}

// ✅ 好：一次渲染中计算
function ProductList() {
  const [products, setProducts] = useState([]);
  const filteredProducts = products.filter((p) => p.inStock);
}
```

**警惕信号**：

- 想要写 `useEffect(() => setX(deriveFromY(y)), [y])`
- 有状态只是镜像其他状态或 props

### 规则 2：使用数据获取库

基于 effect 的获取经常产生竞态条件和重复的缓存逻辑。

```typescript
// ❌ 差：竞态条件风险
function ProductPage({ productId }) {
  const [product, setProduct] = useState(null);

  useEffect(() => {
    fetchProduct(productId).then(setProduct);
  }, [productId]);
}

// ✅ 好：查询库处理取消/缓存/陈旧
function ProductPage({ productId }) {
  const { data: product } = useQuery(["product", productId], () =>
    fetchProduct(productId),
  );
}
```

**警惕信号**：

- 你的 effect 做 `fetch(...)` 然后 `setState(...)`
- 正在重新实现缓存、重试、取消或陈旧处理

### 规则 3：事件处理器，而不是 Effects

如果用户点击按钮，在处理器中做工作。

```typescript
// ❌ 差：Effect 作为动作中转
function LikeButton() {
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (liked) {
      postLike();
      setLiked(false);
    }
  }, [liked]);

  return <button onClick={() => setLiked(true)}>Like</button>;
}

// ✅ 好：直接的事件驱动动作
function LikeButton() {
  return <button onClick={() => postLike()}>Like</button>;
}
```

**警惕信号**：

- 状态被用作标志，让 effect 做真正的动作
- 在构建 "设置标志 -> effect 运行 -> 重置标志" 机制

### 规则 4：使用 useMountEffect 进行一次性外部同步

`useMountEffect` 只是在命名 hook 中包装的 `useEffect(..., [])`，以使意图明确。

```typescript
function useMountEffect(callback: () => void | (() => void)) {
  useEffect(callback, []);
}
```

**适用场景**：

- DOM 集成（focus、scroll）
- 第三方 widget 生命周期
- 浏览器 API 订阅

**条件挂载的好模式**：

```typescript
// ❌ 差：在 effect 内部守卫
function VideoPlayer({ isLoading }) {
  useEffect(() => {
    if (!isLoading) playVideo();
  }, [isLoading]);
}

// ✅ 好：当前置条件满足时才挂载
function VideoPlayerWrapper({ isLoading }) {
  if (isLoading) return <LoadingScreen />;
  return <VideoPlayer />;
}

function VideoPlayer() {
  useMountEffect(() => playVideo());
}
```

**警惕信号**：

- 正与外部系统同步
- 行为本质上是 "挂载时设置，卸载时清理"

### 规则 5：用 key 重置，而不是依赖编排

```typescript
// ❌ 差：Effect 尝试模拟重新挂载行为
function VideoPlayer({ videoId }) {
  useEffect(() => {
    loadVideo(videoId);
  }, [videoId]);
}

// ✅ 好：key 强制干净的重挂载
function VideoPlayer({ videoId }) {
  useMountEffect(() => {
    loadVideo(videoId);
  });
}

function VideoPlayerWrapper({ videoId }) {
  return <VideoPlayer key={videoId} videoId={videoId} />;
}
```

**警惕信号**：

- 写的 effect 唯一工作是当 ID/prop 变化时重置本地状态
- 想要组件像每个实体的新实例一样行为

## 检查清单

在写 React 组件时，始终检查：

- [ ] 不要直接调用 `useEffect`
- [ ] 派生状态应该直接计算，而不是用 effect 同步
- [ ] 数据获取应使用查询库（如 TanStack Query）
- [ ] 用户交互应该在事件处理器中处理
- [ ] 一次性初始化使用 `useMountEffect`
- [ ] 需要重置时使用 `key` 而非依赖 effect

## 失败模式选择

没有团队是零 bug 的。问题是想要哪种失败模式：

- **useMountEffect 失败**：通常是二元的和明显的（运行了，或者没有）
- **直接 useEffect 失败**：经常逐渐退化，表现为 flaky 行为、性能问题，或循环，然后才是硬失败

---

**使用说明**：当编写 React 组件代码时，始终遵循此规范。禁止直接使用 useEffect，用上述替代模式替代。
