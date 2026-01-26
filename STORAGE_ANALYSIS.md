# Persistent Storage Analysis - Modules & Circuits

## Executive Summary

**Circuits**: ✅ **Fully Implemented** - Backend SQLite + Frontend localStorage sync  
**Modules**: ⚠️ **Partially Implemented** - Backend storage exists but frontend doesn't use it

---

## 1. Circuits Storage ✅ COMPLETE

### Backend Implementation
- **Location**: `backend/app/services/storage.py`
- **Database**: SQLite (`backend/data/loom.db`)
- **Table**: `circuits`
  ```sql
  CREATE TABLE circuits (
      name TEXT PRIMARY KEY,
      description TEXT,
      cells TEXT NOT NULL,          -- JSON array of cell data
      model_slots TEXT NOT NULL,     -- JSON object {A, B, C}
      saved_at REAL NOT NULL
  );
  ```

### Backend API (`/api/circuits/`)
- ✅ `GET /` - List all circuits
- ✅ `GET /{name}` - Get specific circuit
- ✅ `POST /` - Create/update circuit
- ✅ `DELETE /{name}` - Delete circuit

### Frontend Implementation
- **Location**: `frontend/src/hooks/useCircuitRunner.ts`
- **Storage Strategy**: Dual-layer (localStorage + backend sync)
- **Functions**:
  - `loadSavedCircuits()` - Loads from localStorage
  - `refreshCircuitsFromBackend()` - Syncs from API to localStorage
  - `saveCircuit()` - Saves to localStorage + POSTs to backend
  - `deleteCircuit()` - Deletes from localStorage + DELETE to backend

### Usage Flow
1. On app mount: `refreshCircuitsFromBackend()` syncs backend → localStorage
2. On save: Circuit saved to localStorage immediately, then POSTed to backend
3. On load: Circuits loaded from localStorage (fast), periodically synced from backend

**Status**: ✅ **Production Ready**

---

## 2. Modules Storage ⚠️ INCOMPLETE

### Backend Implementation
- **Location**: `backend/app/services/storage.py`
- **Database**: SQLite (`backend/data/loom.db`)
- **Table**: `modules`
  ```sql
  CREATE TABLE modules (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      content TEXT DEFAULT '',
      position_x REAL DEFAULT 0,
      position_y REAL DEFAULT 0,
      status TEXT DEFAULT 'idle',
      metadata TEXT DEFAULT '{}',
      created_at REAL,
      updated_at REAL
  );
  ```

### Backend API (`/api/modules/`)
- ✅ `GET /` - List all modules
- ✅ `GET /{module_id}` - Get specific module
- ✅ `POST /` - Create module
- ✅ `PATCH /{module_id}` - Update module
- ✅ `DELETE /{module_id}` - Delete module
- ✅ `POST /{module_id}/execute` - Execute module

### Frontend Implementation
- **Location**: `frontend/src/components/circuit/CircuitBoard.tsx`
- **Current State**: ❌ **Modules are NOT persisted**
- **Storage**: Modules exist only in React state (`useState<CellData[]>`)
- **Issue**: No frontend code calls `/api/modules` endpoints

### Current Module Lifecycle
1. Modules created in-memory when cells are added
2. Modules exist only during session
3. Modules lost on page refresh
4. Modules NOT synced with backend database

**Status**: ⚠️ **Backend Ready, Frontend Missing**

---

## 3. Database Initialization

### Current Approach
- **Lazy Initialization**: `init_db()` called on every storage operation
- **Location**: `storage.py` - each function calls `init_db()` first
- **Behavior**: SQLite creates tables if they don't exist (safe)

### Potential Improvement
- Could add explicit startup initialization in `main.py` for clarity
- Current approach works but could be more explicit

---

## 4. Data Flow Comparison

### Circuits (Working)
```
Frontend State → localStorage → Backend API → SQLite DB
     ↑                                              ↓
     └─────────── Sync on mount/periodic ──────────┘
```

### Modules (Not Working)
```
Frontend State → (nowhere) ❌
Backend API → SQLite DB (exists but unused)
```

---

## 5. Recommendations

### High Priority
1. **Add Module Persistence to Frontend**
   - Create `useModules.ts` hook similar to `useCircuitRunner.ts`
   - Load modules from backend on mount
   - Save modules to backend when created/updated
   - Sync modules between localStorage and backend

2. **Module-Circuit Relationship**
   - Currently circuits store cells as JSON
   - Consider if modules should be separate entities or part of circuits
   - May need to decide: modules as standalone vs. modules as circuit components

### Medium Priority
3. **Database Initialization**
   - Add startup event handler in `main.py` to explicitly initialize DB
   - Makes initialization more visible and testable

4. **Error Handling**
   - Add better error handling for storage operations
   - Handle offline scenarios gracefully

### Low Priority
5. **Migration Support**
   - Add database migration system if schema changes needed
   - Version tracking for database schema

---

## 6. Files Involved

### Backend
- `backend/app/services/storage.py` - SQLite storage layer
- `backend/app/routers/modules.py` - Module API endpoints
- `backend/app/routers/circuits.py` - Circuit API endpoints
- `backend/app/models/module.py` - Module data models

### Frontend
- `frontend/src/hooks/useCircuitRunner.ts` - Circuit storage hooks ✅
- `frontend/src/components/circuit/CircuitBoard.tsx` - Module state management ❌
- `frontend/src/components/circuit/TemplatesSidebar.tsx` - Uses circuit storage ✅

---

## 7. Testing Checklist

### Circuits (Should Work)
- [ ] Create circuit → Check localStorage + backend DB
- [ ] Load circuit → Verify data integrity
- [ ] Delete circuit → Verify removal from both stores
- [ ] Offline mode → Verify localStorage fallback

### Modules (Currently Broken)
- [ ] Create module → Should persist to backend
- [ ] Update module → Should update backend
- [ ] Load modules on mount → Should restore from backend
- [ ] Delete module → Should remove from backend

---

## Conclusion

**You have persistent storage for circuits, but NOT for modules.**

The backend infrastructure for modules exists and is fully functional, but the frontend never calls it. Modules are currently ephemeral - they only exist in React state and are lost on refresh.

To complete module persistence, you need to:
1. Create frontend hooks to load/save modules from backend
2. Integrate module persistence into `CircuitBoard.tsx`
3. Decide on module lifecycle (standalone vs. circuit components)
