import { FirebaseError } from "../error";
import { logger } from "../logger";
import { Options } from "../options";

export interface ParsedFirestoreConfig {
  databaseId: string;
  rules?: string;
  indexes?: string;
}

export function getFirestoreConfig(projectId: string, options: Options): ParsedFirestoreConfig[] {
  const fsConfig = options.config.src.firestore;
  if (fsConfig === undefined) {
    return [];
  }

  const rc = options.rc;
  let allDatabases = !options.only;
  const onlyDatabases = new Set<string>();
  if (options.only) {
    const split = options.only.split(",");
    if (split.includes("firestore")) {
      allDatabases = true;
    } else {
      for (const value of split) {
        if (value.startsWith("firestore:")) {
          const target = value.split(":")[1];
          onlyDatabases.add(target);
        }
      }
    }
  }

  // single DB
  if (!Array.isArray(fsConfig)) {
    if (fsConfig) {
      // databaseId is (default) if none provided
      const databaseId = fsConfig.databaseId || `(default)`;
      return [{ rules: fsConfig.rules, indexes: fsConfig.indexes, databaseId }];
    } else {
      logger.debug("Possibly invalid database config: ", JSON.stringify(fsConfig));
      return [];
    }
  }

  const results: ParsedFirestoreConfig[] = [];
  for (const c of fsConfig) {
    const { databaseId, target } = c;
    if (target) {
      if (allDatabases || onlyDatabases.has(target)) {
        // Make sure the target exists (this will throw otherwise)
        rc.requireTarget(projectId, "firestore", target);
        // Get a list of firestore instances the target maps to
        const databases = rc.target(projectId, "firestore", target);
        for (const databaseId of databases) {
          results.push({ databaseId, rules: c.rules, indexes: c.indexes });
        }
        onlyDatabases.delete(target);
      }
    } else if (databaseId) {
      if (allDatabases) {
        results.push(c as ParsedFirestoreConfig);
      }
    } else {
      throw new FirebaseError('Must supply either "target" or "databaseId" in firestore config');
    }
  }

  if (!allDatabases && onlyDatabases.size !== 0) {
    throw new FirebaseError(
      `Could not find configurations in firebase.json for the following database targets: ${[
        ...onlyDatabases,
      ].join(", ")}`
    );
  }

  return results;
}
