# 单词库导入说明

本项目已支持 SQLite 单词库，数据库文件：

```text
backend/data/english_exam.db
```

## 数据表

- `words`：单词主表，支持 `CET4`、`CET6`、`考研`
- `word_books`：词库表，例如四级核心词汇、六级核心词汇、考研必考词
- `word_book_items`：词库和单词的多对多关联
- `word_review_progress`：用户本地复习进度

## JSON 导入接口

```http
POST /api/vocabulary/import
Content-Type: application/json
```

示例：

```json
{
  "book": {
    "name": "四级核心词汇",
    "category": "CET4",
    "description": "大学英语四级高频词"
  },
  "words": [
    {
      "word": "efficient",
      "phonetic": "/ɪˈfɪʃnt/",
      "meaning": "高效的；有效率的",
      "example": "An efficient plan saves time.",
      "difficulty": 2,
      "frequency": 18
    }
  ]
}
```

## CSV 导入接口

```http
POST /api/vocabulary/import-csv
Content-Type: application/json
```

请求体：

```json
{
  "csvPath": "C:/path/to/cet4_words.csv",
  "category": "CET4",
  "book": {
    "name": "四级核心词汇",
    "description": "从 CSV 导入"
  }
}
```

CSV 表头：

```csv
word,phonetic,meaning,example,difficulty,frequency
efficient,/ɪˈfɪʃnt/,高效的,An efficient plan saves time.,2,18
```

## 分类值

`category` 只能使用：

- `CET4`
- `CET6`
- `考研`

## 前端页面

打开：

```text
http://localhost:5173/words
```

页面支持：

- 四级/六级/考研切换
- 词库选择
- 英文或中文释义搜索
- 显示音标、释义、例句、难度、考频
- 熟悉度复习记录
