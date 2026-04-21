# Security Specification: Socalorie

## Data Invariants
1. **User Identity Invariant**: A user document UID must strictly match the `request.auth.uid`.
2. **Relational Task Invariant**: Energy records and activities must only be writeable by the user who owns them.
3. **Friendship Invariant**: Only the sender or receiver of a friendship record can read/write the relationship.
4. **Notification Invariant**: Only the targeted `userId` can read/delete their notifications.
5. **Immutability Invariant**: Fields like `createdAt` and `senderUid` must not change after creation.
6. **Temporal Integrity**: All `updatedAt` and `createdAt` fields must use `request.time` (server timestamp).

## The Dirty Dozen (Attacker Payloads)

| Attack Type | Payload Description | Target Collection |
|-------------|---------------------|-------------------|
| Identity Spoofing | authenticated as UserA, trying to create UserB profile | `users` |
| Privilege Escalation | trying to set `currentEnergy` to 999999 on another's profile | `users` |
| Data Poisoning | Injecting a 2MB string into `currentSummary` | `users` |
| Record Hijacking | UserA trying to update UserB's `energyRecord` score | `energyRecords` |
| Orphaned Activity | Creating an activity for a user ID that doesn't exist | `activities` |
| Relationship Stealth | UserC (third party) reading `friendships` between A and B | `friendships` |
| Status Shortcut | Setting friendship status to `accepted` during creation (bypassing pending) | `friendships` |
| ID Poisoning | using a 1KB string of random characters as a document ID | `friendships` |
| Notification Trolling | Sending 100 notifications to a user in 1 second | `notifications` |
| Timeline Injection | Modifying `createdAt` to a date in 1999 | `activities` |
| Profile Scraping | Trying to list all users to extract emails | `users` |
| Terminal Lock Break | Updating an energy record from yesterday (immutable) | `energyRecords` |

## Test Runner (TDD)
I will implement `firestore.rules.test.ts` (conceptual as we don't have a test runner tool, but following the spec).
