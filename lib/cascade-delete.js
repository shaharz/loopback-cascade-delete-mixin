'use strict';
var debug = require('debug')('loopback:mixins:cascade-delete');

module.exports = function (Model, options) {
  // source: https://github.com/strongloop/loopback-datasource-juggler/blob/63482ef0619bfff429e807bfa2af6ea8b6c00edc/lib/dao.js#L47
  function idName(m) {
    return m.definition.idName() || 'id';
  }

  function getIdValue(m, data) {
    return data && data[idName(m)];
  }

  var cascadeDeletes = options.relations.map(function (opts) {
    return function (instance) {
      debug('Relation ' + opts.rel + ' model ' + Model.definition.name);

      opts.options = opts.options || {};

      if (opts.options.skipCascade) {
        return Promise.resolve();
      }

      if (!Model.relations[opts.rel]) {
        debug('Relation ' + opts.rel + ' not found for model ' + Model.definition.name);
        throw 'Relation ' + opts.rel + ' not found for model ' + Model.definition.name;
      }

      return new Promise(function (resolve, reject) {
        instance[opts.rel].destroyAll(function (err, info) {
          debug('Relation ', opts.rel, ' deleted with info ', info);
          resolve(info);
        });
      });
    };
  });

  Model.observe('before delete', function (ctx) {
    var name = idName(Model);
    var hasInstanceId = ctx.instance && ctx.instance[name];
    var hasWhereId = ctx.where && ctx.where[name];

    if (!(hasWhereId || hasInstanceId)) {
      debug('Skipping delete for ', Model.definition.name);
      return Promise.resolve();
    }

    var id = getIdValue(Model, ctx.instance || ctx.where);
    var where = {};
    where[idName(Model)] = id;

    return Model.findOne({
      where: where,
    }).then(function (instance) {
      var deleted = cascadeDeletes.map(function (deleteRel) {
        return deleteRel(instance);
      });

      return Promise.all(deleted)
      .catch(function (err) {
          debug('Error with cascading deletes', err);
          throw err;
      });
    }).catch(function (err) {
      debug('Error fetching instance for delete', err);
      throw err;
    });
  });
};
