import { promises as fs } from 'fs';
import { parse, relative, sep } from 'path';
import { CodegenConnectionStringParser } from './connection-string-parser';
import { CodegenDialectManager, CodegenDialectName } from './dialect-manager';
import { CodegenFormat } from './enums/format';
import { LogLevel } from './enums/log-level';
import { CodegenDatabaseIntrospector } from './introspector';
import { Logger } from './logger';
import { CodegenSerializer } from './serializer';

export class CodegenGenerator {
  readonly dialectName: CodegenDialectName | undefined;
  readonly format: CodegenFormat;
  readonly logLevel: LogLevel;
  readonly outFile: string;
  readonly print: boolean;
  readonly url: string;

  constructor(options: {
    dialectName?: CodegenDialectName;
    format?: CodegenFormat;
    logLevel: LogLevel;
    outFile: string;
    print?: boolean;
    url: string;
  }) {
    this.dialectName = options.dialectName;
    this.format = options.format ?? CodegenFormat.INTERFACE;
    this.logLevel = options.logLevel;
    this.outFile = options.outFile;
    this.print = options.print ?? false;
    this.url = options.url;
  }

  /**
   * Generates a file with database type definitions.
   *
   * @example
   * ```typescript
   * import { generate } from 'kysely-codegen';
   *
   * await generate({
   *   driver: 'pg',
   *   logLevel: LogLevel.WARN,
   *   outFile: './kysely-codegen/index.d.ts',
   *   url: 'env(DATABASE_URL)',
   * });
   *
   * // Output:
   * export type User = {
   *   created_at: Date;
   *   email: string;
   *   full_name: string;
   *   is_active: boolean;
   * };
   * ```
   */
  async generate() {
    const logger = new Logger(this.logLevel);
    const connectionStringParser = new CodegenConnectionStringParser({
      logger,
      url: this.url,
    });
    const { connectionString, dialectName } =
      connectionStringParser.parseConnectionString();

    if (dialectName === this.dialectName) {
      logger.info(`Using dialect '${dialectName}'.`);
    } else {
      logger.info(`No dialect specified. Assuming '${dialectName}'.`);
    }

    const dialectManager = new CodegenDialectManager();
    const dialect = dialectManager.getDialect(this.dialectName ?? dialectName);

    const startTime = performance.now();

    logger.info('Introspecting database...');

    const introspector = new CodegenDatabaseIntrospector({
      connectionString,
      dialect,
    });
    const tables = await introspector.introspect();

    logger.debug();
    logger.debug(`Found ${tables.length} public tables:`);

    for (const table of tables) {
      logger.debug(` - ${table.name}`);
    }

    logger.debug();

    const serializer = new CodegenSerializer({
      dialect,
      format: this.format,
      tables,
    });
    const data = serializer.serialize();

    if (this.print) {
      logger.log();
      logger.log(data);
    } else {
      const outDir = parse(this.outFile).dir;

      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(this.outFile, data);

      const endTime = performance.now();
      const relativeOutDir = `.${sep}${relative(process.cwd(), this.outFile)}`;
      const duration = Math.round(endTime - startTime);

      logger.success(
        `Introspected ${tables.length} tables and generated ${relativeOutDir} in ${duration}ms.`,
      );
    }
  }
}
