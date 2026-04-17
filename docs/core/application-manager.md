# ApplicationManager

**檔案**：`src/application/ApplicationManager.ts`

管理應用程式定義（Application）的登錄與查詢。

---

## API

| 方法 | 簽章 | 說明 |
|------|------|------|
| `register()` | `(app, stableId?) → string` | 登錄應用程式，回傳 appId |
| `registerBuiltin()` | `(appId, app) → void` | 以指定 appId 登錄內建應用程式 |
| `unregister()` | `(appId) → boolean` | 移除登錄 |
| `get()` | `(appId) → Application \| undefined` | 查詢單一應用程式 |
| `getAll()` | `() → Application[]` | 取得所有已登錄應用程式 |

---

## Application 介面

```typescript
interface Application {
  name: string;
  version: string;
  permissions: string[];
  maxInstances?: number;   // undefined 或 0 = 不限制；1 = 單例模式
  appId?: string;          // 由 register() 自動賦予
}
```

---

## register()

```typescript
register(app: Omit<Application, 'appId'>, stableId?: string): string
```

- `stableId`：若提供，以此作為 appId（適用於 manifest 中明確定義 id 的應用程式）
- 未提供時自動生成 `appdef_{timestamp}_{counter}` 格式的 ID

---

## registerBuiltin()

```typescript
registerBuiltin(appId: string, app: Omit<Application, 'appId'>): void
```

用於登錄內建應用程式（如 kernel console），直接指定 appId。
