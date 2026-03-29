# ApplicationManager

**檔案**：`src/application/ApplicationManager.ts`

應用程式定義的登錄簿。每個應用程式（Application）在系統內經由此管理器取得唯一的 `appDefId`。

---

## API

| 方法 | 簽章 | 說明 |
|------|------|------|
| `register()` | `(app: Omit<Application, 'appId'>) → string` | 登錄應用定義，回傳 `appDefId` |
| `unregister()` | `(appId) → boolean` | 移除定義 |
| `get()` | `(appId) → Application \| undefined` | 查詢定義 |
| `getAll()` | `() → Application[]` | 取得所有定義 |

---

## Application 結構

```typescript
interface Application {
  name: string;
  version: string;
  permissions: string[];
  maxInstances?: number;   // 0 或 undefined = 不限；1 = 單例
  appId?: string;          // 由 register() 自動賦予
}
```

---

## appDefId 產生規則

格式：`appdef_<timestamp>_<counter>`

每次呼叫 `register()` 會遞增內部計數器，確保唯一性。

---

## 與其他元件的關係

- **ProcessManager** 在 `launch()` 時透過 `appManager.get(appDefId)` 查詢應用定義
- **Bootstrap** 在啟動時透過 `register()` 將 ApplicationCatalog 的結果登錄
