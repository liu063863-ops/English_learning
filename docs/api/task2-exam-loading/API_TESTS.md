# Task 2 API Tests

Base URL:

```bash
http://127.0.0.1:4000
```

Mock user header:

```bash
x-user-id: 64f000000000000000000001
```

Replace `:examId` with a real `_id` from `GET /api/exams`.

## 1. List Exams

```bash
curl "http://127.0.0.1:4000/api/exams?page=1&pageSize=10&examType=CET4&year=2023&month=6"
```

Expected response:

```json
{
  "success": true,
  "message": "试卷列表获取成功",
  "data": [
    {
      "_id": "64f111111111111111111111",
      "examType": "CET4",
      "year": 2023,
      "month": 6,
      "paperNo": 1,
      "title": "2023年6月大学英语四级考试真题（第1套）示例结构",
      "totalScore": 100,
      "durationMinutes": 125,
      "status": "published"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

## 2. Get Full Exam Detail

```bash
curl "http://127.0.0.1:4000/api/exams/:examId"
```

Load only reading section:

```bash
curl "http://127.0.0.1:4000/api/exams/:examId?sectionType=reading"
```

Load listening with transcript and audio metadata:

```bash
curl "http://127.0.0.1:4000/api/exams/:examId?sectionType=listening"
```

By default, listening audio URL is returned, but heavy transcript text is blanked unless `sectionType=listening`.

## 3. Start Exam

```bash
curl -X POST "http://127.0.0.1:4000/api/exams/:examId/start" \
  -H "Content-Type: application/json" \
  -H "x-user-id: 64f000000000000000000001"
```

If the same user starts the same paper again while the session is still `in_progress`, the API returns the existing session instead of creating a duplicate.

## 4. Get Progress

```bash
curl "http://127.0.0.1:4000/api/exams/:examId/progress" \
  -H "x-user-id: 64f000000000000000000001"
```

Expected response:

```json
{
  "success": true,
  "message": "答题进度获取成功",
  "data": {
    "sessionId": "64f222222222222222222222",
    "status": "in_progress",
    "remainingSeconds": 7340,
    "currentSectionType": "listening",
    "answeredCount": 0,
    "answers": []
  }
}
```

## Error Response Format

All errors use the same shape:

```json
{
  "success": false,
  "error": {
    "code": "EXAM_NOT_FOUND",
    "message": "试卷不存在或未发布",
    "details": {}
  }
}
```

Common errors:

| HTTP | code | Meaning |
|:---|:---|:---|
| 400 | INVALID_OBJECT_ID | Invalid MongoDB ObjectId |
| 404 | EXAM_NOT_FOUND | Paper does not exist or is not published |
| 404 | SESSION_NOT_FOUND | No active session for this user and paper |
| 404 | ROUTE_NOT_FOUND | Unknown route |
| 409 | DUPLICATE_RESOURCE | Unique index conflict |
| 500 | INTERNAL_SERVER_ERROR | Unexpected server error |
