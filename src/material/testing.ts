/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { EngineHost, TaskScheduler } from '@angular-devkit/schematics';
import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { join } from 'path';
import { from as observableFrom, Observable } from 'rxjs';
import { concatMap, filter, last } from 'rxjs/operators';

/** Path to the test collection file for the Material schematics */
export const collectionPath = join(__dirname, '..', 'test-collection.json');

/** Path to the test migration file for the Material update schematics */
export const migrationCollection = join(__dirname, '..', 'test-migration.json');

/** Create a base app used for testing. */
export function createTestApp(): UnitTestTree {
  const baseRunner = new SchematicTestRunner('material-schematics', collectionPath);

  const workspaceTree = baseRunner.runExternalSchematic('@schematics/angular', 'workspace', {
    name: 'workspace',
    version: '6.0.0',
    newProjectRoot: 'projects'
  });

  return baseRunner.runExternalSchematic(
    '@schematics/angular',
    'application',
    {
      name: 'material',
      inlineStyle: false,
      inlineTemplate: false,
      routing: false,
      style: 'scss',
      skipTests: false
    },
    workspaceTree
  );
}

/**
 * Due to the fact that the Angular devkit does not support running scheduled tasks from a
 * schematic that has been launched through the TestRunner, we need to manually find the task
 * executor for the given task name and run all scheduled instances.
 *
 * Note that this means that there can be multiple tasks with the same name. The observable emits
 * only when all tasks finished executing.
 */
export function runPostScheduledTasks(runner: SchematicTestRunner, taskName: string): Observable<void | {}> {
  // Workaround until there is a public API to run scheduled tasks in the @angular-devkit.
  // See: https://github.com/angular/angular-cli/issues/11739
  const host = runner.engine['_host'] as EngineHost<{}, {}>;
  const tasks = runner.engine['_taskSchedulers'] as TaskScheduler[];

  return observableFrom(tasks).pipe(
    concatMap(scheduler => scheduler.finalize()),
    filter(task => task.configuration.name === taskName),
    concatMap(task => {
      return (
        host
          .createTaskExecutor(task.configuration.name)
          // @ts-ignore
          .pipe(concatMap(executor => executor(task.configuration.options, task.context)))
      );
    }),
    // Only emit the last emitted value because there can be multiple tasks with the same name.
    // The observable should only emit a value if all tasks completed.
    last()
  );
}
