# Security Specification - SSTR State Engine

This document defines the data invariants, threat model, and validation tests for SSTR's Firestore-based real-time synchronization engine.

## 1. Data Invariants
1. **State Isolation**: Only authorized document keys under `/sstr_state/` are allowed to be modified (`records`, `batches`, `pendingRequests`, `managers`, `vales`, `crewList`, `repsSetor`, `customPdvs`). Any other document path under `/sstr_state/` must be rejected.
2. **Payload Size Boundaries**: No state document update may exceed 10MB (to prevent Denial of Wallet resource-exhaustion attacks).
3. **Structured Schema Validation**: All updates to state documents must contain the `data` and `updatedAt` fields. `updatedAt` must be a valid numerical timestamp.
4. **Log Immortality**: Documents in the `/sstr_logs/` collection are append-only. Once written, they cannot be updated or deleted.
5. **Log Integrity**: Every audit log entry must contain `usuario`, `action`, `tabela`, and a valid `timestamp`.

## 2. The "Dirty Dozen" Malicious Payloads
Here are the 12 specific payloads designed to breach the system's security, which the rules must reject:

### Payload 1: Unauthorized Collection Write
Attempting to create a root collection other than `sstr_state` or `sstr_logs`.
```json
// Path: /unauthorized_collection/test
{
  "leak": "unsecured data"
}
```

### Payload 2: Custom Document Key under sstr_state
Attempting to inject a custom document ID into the `sstr_state` collection to spam or poison database queries.
```json
// Path: /sstr_state/malicious_state_document
{
  "data": "spam",
  "updatedAt": 1720239023
}
```

### Payload 3: Missing Required Base Fields
Attempting to write a state document without the `data` wrapper.
```json
// Path: /sstr_state/pendingRequests
{
  "unwrappedData": []
}
```

### Payload 4: Invalid Timestamp Type
Writing an `updatedAt` field as a string rather than a number.
```json
// Path: /sstr_state/pendingRequests
{
  "data": [],
  "updatedAt": "2026-07-16"
}
```

### Payload 5: Missing Log Fields
Writing an audit log without a `usuario` or `action`.
```json
// Path: /sstr_logs/log_123
{
  "tabela": "records",
  "timestamp": 1720239023
}
```

### Payload 6: Log Modification Attempt (Update)
Trying to modify an existing audit log entry to cover up changes.
```json
// Path: /sstr_logs/log_existing (Update)
{
  "usuario": "Hacker",
  "action": "EXCLUSAO",
  "tabela": "records"
}
```

### Payload 7: Log Deletion Attempt
Trying to delete an audit log document.
```json
// Path: /sstr_logs/log_existing (Delete)
```

### Payload 8: State Document Deletion Attempt
Trying to delete critical state synchronization keys like `records` or `pendingRequests`.
```json
// Path: /sstr_state/records (Delete)
```

### Payload 9: Size Exhaustion Attack
Writing a payload with a massive string value in `updatedAt` to consume cloud storage.
```json
// Path: /sstr_state/records
{
  "data": [],
  "updatedAt": 99999999999999999999999999
}
```

### Payload 10: Injecting shadow fields into state documents
Attempting to write fields other than `data` and `updatedAt`.
```json
// Path: /sstr_state/records
{
  "data": [],
  "updatedAt": 1720239023,
  "shadowField": "injected"
}
```

### Payload 11: Invalid Log Timestamp
Writing an audit log where the `timestamp` is a string.
```json
// Path: /sstr_logs/log_123
{
  "usuario": "Gestor",
  "action": "CRIACAO",
  "tabela": "records",
  "timestamp": "now"
}
```

### Payload 12: Invalid Log Field Types
Writing an audit log where `usuario` is an array instead of a string.
```json
// Path: /sstr_logs/log_123
{
  "usuario": ["Gestor"],
  "action": "CRIACAO",
  "tabela": "records",
  "timestamp": 1720239023
}
```

---

## 3. Test Runner Specification (`firestore.rules.test.ts`)
To verify that these payloads are safely blocked, a test suite is executed using the `@firebase/rules-unit-testing` package:

```typescript
import { initializeTestEnvironment, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "bionic-petal-fwx5p",
    firestore: {
      rules: require("fs").readFileSync("firestore.rules", "utf8")
    }
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

test("Rejects unauthorized collections", async () => {
  const context = testEnv.unauthenticatedContext();
  const db = context.firestore();
  await expect(setDoc(doc(db, "unauthorized_collection", "test"), { leak: "unsecured" }))
    .rejects.toThrow();
});

test("Rejects custom state document IDs", async () => {
  const context = testEnv.unauthenticatedContext();
  const db = context.firestore();
  await expect(setDoc(doc(db, "sstr_state", "malicious_state_document"), { data: "spam", updatedAt: 123456 }))
    .rejects.toThrow();
});

test("Allows correct state document format", async () => {
  const context = testEnv.unauthenticatedContext();
  const db = context.firestore();
  await expect(setDoc(doc(db, "sstr_state", "records"), { data: [], updatedAt: Date.now() }))
    .resolves.not.toThrow();
});
```
