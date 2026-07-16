# Chaos Module (Manual Helper)

This optional script manually deletes one pod by label selector:

```bash
node chaos-injector.js app=service-a
```

The risk engine uses the same native `kubectl delete pod` mechanism automatically when the system state is SAFE.
