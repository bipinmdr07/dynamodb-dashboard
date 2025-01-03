import { chunk } from "lodash";
import { AWS } from "../config/aws";
import { EVENTS } from "../constants/event";

import ItemServiceProvider from "./item.service";
import TableServiceProvider from "./table.service";
import { POOL_SIZE } from "../constants/dynamodb";

export default class DatabaseServiceProvider {
  /**
   * @param {AWS} _AWS_
   * @param {object} credentials
   */
  constructor(_AWS_, credentials) {
    // TARGET
    this.TARGET = {
      AWS: _AWS_,
      ItemService: new ItemServiceProvider(_AWS_),
      TableService: new TableServiceProvider(_AWS_),
    };

    // SOURCE
    this.SOURCE = {};
    this.SOURCE.AWS = new AWS();
    this.SOURCE.AWS.initialize(credentials);
    this.SOURCE.ItemService = new ItemServiceProvider(this.SOURCE.AWS);
    this.SOURCE.TableService = new TableServiceProvider(this.SOURCE.AWS);
  }

  /**
   * @returns {Promise<Array<string>>}
   */
  async all() {
    const tables = await this.SOURCE.TableService.all();

    return tables;
  }

  /**
   * @param {Array<string>} tableNames
   * @param {string} uid
   * @param {EventEmitter} eventEmitter
   *
   * @returns {Promise<Array<string>>}
   */
  async restore(tableNames = [], uid, eventEmitter) {
    const cloneTableNames = [...tableNames];
    const queuedTables = cloneTableNames.splice(0, POOL_SIZE)
    let activeTableCount = queuedTables.length

    const restoreTable = async (tableName) => {
      eventEmitter.emit(EVENTS.ACTIVE, uid, { tableName })

      try {
        await TableServiceProvider.restore(tableName, this);
        eventEmitter.emit(EVENTS.SUCCESS, uid, { tableName });
      } catch (error) {
        eventEmitter.emit(EVENTS.FAILED, uid, { tableName, error });
        console.error(error);
      } finally {
        eventEmitter.emit(EVENTS.RESTORE_TABLE);
      }
    }

    eventEmitter.on(EVENTS.RESTORE_TABLE, async () => {
      if (!cloneTableNames.length) {
        activeTableCount -= 1

        if (activeTableCount === 0) {
          eventEmitter.emit(EVENTS.END, uid);
        }

        return;
      }

      const tableName = cloneTableNames.shift();

      restoreTable(tableName)
    })


    queuedTables.map(async (tableName) => {
      await restoreTable(tableName)
    })

    return tableNames;
  }
}
