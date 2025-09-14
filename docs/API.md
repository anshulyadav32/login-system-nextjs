# API Documentation

## Overview

This document describes the REST API endpoints available in the Next.js backend application.

## Base URL

```
Development: http://localhost:3001
Production: https://your-domain.com
```

## Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Response Format

All API responses follow a consistent format:

```json
{
  "success": true,
  "data": {},
  "message": "Success message",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

Error responses:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Endpoints

### Authentication

#### Register User

```http
POST /api/auth/register
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "username": "username",
  "password": "SecurePass123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "username": "username"
    },
    "token": "jwt-token"
  }
}
```

#### Login User

```http
POST /api/auth/secure-login
```

**Request Body:**
```json
{
  "identifier": "user@example.com",
  "password": "SecurePass123"
}
```

#### Logout User

```http
POST /api/auth/secure-logout
```

**Headers:** `Authorization: Bearer <token>`

#### Refresh Token

```http
POST /api/auth/refresh
```

**Request Body:**
```json
{
  "refreshToken": "refresh-token"
}
```

### Passkey Authentication

#### Register Passkey - Initiate

```http
POST /api/auth/passkey/register
```

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

#### Register Passkey - Verify

```http
PUT /api/auth/passkey/register
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "credential": {
    "id": "credential-id",
    "rawId": "raw-id",
    "response": {
      "clientDataJSON": "client-data",
      "attestationObject": "attestation-object"
    },
    "type": "public-key"
  }
}
```

#### Authenticate with Passkey - Initiate

```http
POST /api/auth/passkey/authenticate
```

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

#### Authenticate with Passkey - Verify

```http
PUT /api/auth/passkey/authenticate
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "credential": {
    "id": "credential-id",
    "rawId": "raw-id",
    "response": {
      "clientDataJSON": "client-data",
      "authenticatorData": "authenticator-data",
      "signature": "signature"
    },
    "type": "public-key"
  }
}
```

#### Manage Passkeys

```http
GET /api/auth/passkey/manage
```

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "credentials": [
      {
        "id": "credential-id",
        "nickname": "My iPhone",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "lastUsed": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

#### Delete Passkey

```http
DELETE /api/auth/passkey/manage
```

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "credentialId": "credential-id"
}
```

#### Rename Passkey

```http
POST /api/auth/passkey/manage
```

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "credentialId": "credential-id",
  "nickname": "New Nickname"
}
```

### Profile Management

#### Get Profile

```http
GET /api/profile
```

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "username",
      "email": "user@example.com",
      "profilePicture": "https://example.com/avatar.jpg",
      "role": "USER",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "lastLoginAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

#### Update Profile

```http
PUT /api/profile
```

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "username": "newusername",
  "email": "newemail@example.com",
  "profilePicture": "https://example.com/new-avatar.jpg",
  "currentPassword": "CurrentPass123",
  "newPassword": "NewPass123",
  "confirmPassword": "NewPass123"
}
```

#### Get Auth Profile (Extended)

```http
GET /api/auth/profile
```

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `includeStats`: boolean - Include user statistics
- `includeSessions`: boolean - Include active sessions

### User Management (Admin)

#### Get All Users

```http
GET /api/admin/users
```

**Headers:** `Authorization: Bearer <admin-token>`

**Query Parameters:**
- `page`: number - Page number (default: 1)
- `limit`: number - Items per page (default: 10)
- `search`: string - Search term
- `role`: string - Filter by role

#### Get User by ID

```http
GET /api/admin/users/:id
```

**Headers:** `Authorization: Bearer <admin-token>`

#### Update User

```http
PUT /api/admin/users/:id
```

**Headers:** `Authorization: Bearer <admin-token>`

**Request Body:**
```json
{
  "role": "ADMIN",
  "isLocked": false
}
```

#### Delete User

```http
DELETE /api/admin/users/:id
```

**Headers:** `Authorization: Bearer <admin-token>`

### Health Check

#### Server Status

```http
GET /api/health
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "uptime": 3600,
    "database": "connected",
    "memory": {
      "used": "50MB",
      "total": "512MB"
    }
  }
}
```

## Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Request validation failed |
| `UNAUTHORIZED` | Authentication required |
| `FORBIDDEN` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `CONFLICT` | Resource already exists |
| `RATE_LIMITED` | Too many requests |
| `INTERNAL_ERROR` | Server error |

## Rate Limiting

API endpoints are rate limited to prevent abuse:

- Authentication endpoints: 5 requests per minute
- General API endpoints: 100 requests per minute
- Admin endpoints: 50 requests per minute

## Pagination

Endpoints that return lists support pagination:

```json
{
  "success": true,
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 100,
      "totalPages": 10,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

## WebSocket Events

Real-time events are available via WebSocket connection:

```javascript
const ws = new WebSocket('ws://localhost:3001/ws')

// Authentication
ws.send(JSON.stringify({
  type: 'auth',
  token: 'your-jwt-token'
}))

// Listen for events
ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  console.log('Received:', data)
}
```

### Available Events

- `user.login` - User logged in
- `user.logout` - User logged out
- `profile.updated` - Profile was updated
- `passkey.registered` - New passkey registered
- `passkey.deleted` - Passkey was deleted

## SDK Examples

### JavaScript/TypeScript

```typescript
import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:3001/api',
  headers: {
    'Content-Type': 'application/json'
  }
})

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Login example
const login = async (identifier: string, password: string) => {
  const response = await api.post('/auth/secure-login', {
    identifier,
    password
  })
  
  const { token } = response.data.data
  localStorage.setItem('token', token)
  
  return response.data
}
```

### cURL Examples

```bash
# Register user
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "username": "testuser",
    "password": "SecurePass123"
  }'

# Login
curl -X POST http://localhost:3001/api/auth/secure-login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "user@example.com",
    "password": "SecurePass123"
  }'

# Get profile
curl -X GET http://localhost:3001/api/profile \
  -H "Authorization: Bearer your-jwt-token"
```