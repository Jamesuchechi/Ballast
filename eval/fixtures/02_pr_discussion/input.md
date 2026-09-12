# Pull Request #142: Fix Redis connection leak during retry backoff

Author: dev-chen
Reviewers: reviewer-maya, reviewer-tom
Status: Merged

## Comments

reviewer-maya (2026-07-10 11:20):
"Line 84: We are not closing the orphan socket when exponential backoff triggers a reconnect. This will exhaust client file descriptors under network partitions."

dev-chen (2026-07-10 13:45):
"Commit 4f82a1b explicitly calls client.disconnect() in the catch block before sleeping."

reviewer-tom (2026-07-10 15:00):
"Benchmark shows socket count remains flat under simulated 50% packet drop. LGTM to merge."
