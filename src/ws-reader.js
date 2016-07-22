/* eslint-disable */

import {VizabiPromise} from './vizabi-promise';
import {QueryEncoder} from './query-encoder';
import {Utils} from './utils';
import {Unpack} from './unpack';
import cloneDeep from 'lodash/cloneDeep';

var FILE_CACHED = {}; //caches files from this reader
var FILE_REQUESTED = {}; //caches files from this reader

function getRandomIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export class WSReader {

  getReader() {

    const ERROR_NETWORK = 'Connection Problem';
    const ERROR_RESPONSE = 'Bad Response';
    const ERROR_ORDERING = 'Cannot sort response. Column does not exist in result.';
    const ERROR_PARAM_PATH = 'Missing base path for waffle reader';

    return {

      init(reader_info) {

        this._name = 'waffle';
        this._data = [];
        this._basepath = reader_info.path;
        this._parsers = reader_info.parsers;

        if (!this._basepath) {
          Utils.error(ERROR_PARAM_PATH);
        }

        // UPDATE
        // http://localhost:3000/api/graphs/stats/vizabi-tools"

        // *** /api/graphs/stats/vizabi-tools
        // *** /api/ddf/entities

        // *** /api/graphs/stats/vizabi-tools
        // *** /api/ddf/datapoints

        this._predefined_path = {
          'old_path':'/api/graphs/stats/vizabi-tools',
          'datapoints':'/api/ddf/datapoints',
          'entities':'/api/ddf/entities'
        };

        this._data = [];
      },

      read(query, language) {

        var p = new VizabiPromise();

        // START :: improvements

        // encode query and check path
        var encodedQuery = this._encodeQuery(query);
        var path = this._basepath + '?' + encodedQuery;

        console.log("WS SOURCE", path);

        // END :: improvements

        this._data = [];

        //if cached, retrieve and parse
        if (FILE_CACHED.hasOwnProperty(path)) {
          this._parse(p, query, FILE_CACHED[path]);
          return p;
        }
        //if requested by another hook, wait for the response
        if (FILE_REQUESTED.hasOwnProperty(path)) {
          return FILE_REQUESTED[path];
        }
        //if not, request and parse
        FILE_REQUESTED[path] = p;

        Utils.getRequest(
          path,
          [],
          this._readCallbackSuccess.bind(this, p, path, query),
          this._readCallbackError.bind(this, p, path, query),
          true
        );

        return p;
      },

      getData() {
        return this._data;
      },







      _encodeQuery: function (query) {

        var params = cloneDeep(query);
        var _params = cloneDeep(params.where);

        // START :: improvements

        // 1. detect additional where parameters

        if(params.where) {
          for(let whereKey in params.where) {
            if(whereKey.indexOf(".") != -1) {
              let whereKeyPart = whereKey.split(".");
              let whereKeyPrefix = whereKeyPart[0];
              let whereDataLength = params.where[whereKey].length;
              for(let whereKeyIndex = 0; whereKeyIndex < whereDataLength; whereKeyIndex++) {
                if(params.where[whereKey][whereKeyIndex] != 'unstate') {
                  let generatedKey = whereKeyPrefix + '.is--' + params.where[whereKey][whereKeyIndex];
                  _params[generatedKey] = 1;
                }
              }
              delete _params[whereKey];
            }
          }
        }

        // 2. detect destination

        let pathOldKey = 'old_path';
        let pathKey = 'datapoints';
        if(params.select) {
          let selectLength = params.select.length;
          for(let selectIndex = 0; selectIndex < selectLength; selectIndex++) {
            if(params.select[selectIndex].indexOf(".") != -1) {
              pathKey = 'entities';
              break;
            }
          }
        }

        // 3. update path with new one

        this._basepath = this._basepath
          .split(this._predefined_path[pathOldKey])
          .join(this._predefined_path[pathKey]);

        // 4. update select statement

        let paramKey = [];
        if(params.select) {
          let paramSelectNew = [];
          let selectLength = params.select.length;
          for(let selectIndex = 0; selectIndex < selectLength; selectIndex++) {
            if(params.select[selectIndex].indexOf(".") != -1) {
              let selectKeyPart = params.select[selectIndex].split(".");
              let selectKeyPrefix = selectKeyPart[0];
              let selectKeyCleared = selectKeyPart[1];
              // store select prefix into param Key
              if(paramKey.indexOf(selectKeyPrefix) == -1) {
                paramKey.push(selectKeyPrefix);
              }
              // update select statement
              paramSelectNew.push(selectKeyCleared);
              //params.select.splice(selectIndex, 1);
            } else {
              paramSelectNew.push(params.select[selectIndex]);
            }
          }
          params.select = paramSelectNew;

          // update parameter Key for DataPoints request
          if(pathKey == 'datapoints') {
            Array.prototype.push.apply(paramKey, paramSelectNew.slice(0, 2));
          }
        }

        // 5. add Key parameter

        if(paramKey.length) {
          _params.key = paramKey;
          query.key = paramKey;
        }

        // 6. add request type into Base Query
        //params.pathKey = pathKey;

        // END :: improvements

        _params.select = params.select;
        _params.gapfilling = params.gapfilling;

        // todo: WS doesn't support value `*` for geo parameter
        // remove this condition when geo will be removed from params.where (when you need all geo props)
        if (_params.geo && _params.geo.length === 1 && _params.geo[0] === '*') {
          delete _params.geo;
        }

        var result = [];

        // create `key=value` pairs for url query string
        Object.keys(_params).map(function (key) {
          var value = QueryEncoder.encodeQuery(_params[key]);
          if (value) {
            result.push(key + '=' + value);
          }
        });

        return result.join('&');
      },

      _encodeQueryOld: function (params) {

        var _params = cloneDeep(params.where);

        _params.select = params.select;
        _params.gapfilling = params.gapfilling;

        // todo: WS doesn't support value `*` for geo parameter
        // remove this condition when geo will be removed from params.where (when you need all geo props)
        if (_params.geo && _params.geo.length === 1 && _params.geo[0] === '*') {
          delete _params.geo;
        }

        var result = [];

        // create `key=value` pairs for url query string
        Object.keys(_params).map(function (key) {
          var value = QueryEncoder.encodeQuery(_params[key]);
          if (value) {
            result.push(key + '=' + value);
          }
        });

        return result.join('&');
      },

      _readCallbackSuccess: function (p, path, query, resp) {

        console.log("Success", path);

        if (!resp) {
          Utils.error("Empty json: " + path);
          p.reject({
            'message' : ERROR_RESPONSE,
            'data': path
          });
          return;
        }







          // START :: improvements

          console.warn("WAFFLE SERVER READER EXTERNAL", path);

          let self = this;

          Unpack(resp, function (err, unpackedJson) {

            if(err) {
              Utils.error("Unpack error: ", err);
              p.reject({
                'message' : 'Unpack error',
                'data': err
              });
              return;
            }

            // Fix :: prefix
            // if (['', '', ''].some(val => val === key)) { skip }

            if(path.indexOf('entities') > -1) {
              let prefixKey = query.key[0];
              unpackedJson.forEach(function(value, index){
                for(let keyEntity in value) {
                  if (
                    keyEntity.indexOf("shape") == -1 &&
                    query.key.indexOf(keyEntity) == -1
                  ) {
                    let currValue = value[keyEntity];
                    value[prefixKey + '.' + keyEntity] = currValue;
                    delete value[keyEntity];
                  }
                  if (keyEntity.indexOf("shape") > -1) {

                    let correctStub = {
                      "africa": "<svg xmlns='http://www.w3.org/2000/svg' version='1.1' viewBox='0 0 584.5 364.5'><path id='africa' d='M322.7,114.7l-1-1.8l-6.5,2.3l-16-4.8l-2.3,1.7l-1.8,4.5l-16.9-8.6l-0.2-0.6l-0.3-5.5l-2-2.8l-29,4.4l-0.2-0.4 l-1.7,0.2l-0.1,1.1l-6.7,7l-0.5,1.9l-0.6,0.7l-0.3,3.3l-15.3,23.7l0.6,13.2l-1.4,3l1.1,7.6l12.1,17.9l6,2.8l7.1-1.9l4.5,0.8 l13.7-3.3l3.9,4.5h3.5l1.6,1.4l1.8,3.6l-1.1,10.7l9.2,27.4l-4,14.6l8.5,30.7l1.1,1.1v0.7h0.5l3.5,12.5l2,1.7l11.9-0.6l15-18.2v-3.9 l5.1-4.5l1.1-4.2l-1.1-5.9l10.5-12.2l0.6-0.3l1.6-3.7l-3.4-24l25-43.3l-13.1,1.1l-1.8-1.1l-24.7-48.6l0.9-0.4l0.6-1L322.7,114.7  M360.1,233.2l2.3,1.7l-8.6,30.5l-4.3-0.6l-2-7.6l2.8-14.6l6.4-4.4l2.8-4.9L360.1,233.2z'/></svg>",
                      "americas": "<svg xmlns='http://www.w3.org/2000/svg' version='1.1' viewBox='0 0 584.5 364.5'><path id='americas' d='M134.8,152l-11.4,1.8l-3.1-1.7l5.3-1.3l-0.7-1.1l-3.3-1.4h-0.1l-8.1-0.9l-0.3-0.3l-0.3-1.5l-6.2-3.6l-3.4,0.8 l-1.6,1.3l-1.2-0.5l-0.7-1.7l3.8-1.6l9.1,0.7l9.5,5.3l0,0l3.3,1.8l1.7-0.5l6.6,2.8L134.8,152 M183.7,25.4l-0.5-1.5l-2.6-2.2 l-2.1-0.6l-2.9-2.2l-18.2-2.2l-5.1,3.7l2,4.3l-6,2.2l1-1.7l-4.6-1.9l-0.5-1.7l-1.1-1.2l-2.9,0.5l-2.1,4.2l-5.8,2.5l-15.5-2.2 l10.5-1.7l-1.3-4l-11.6-0.4l-3.2-1.5L96,20.7h5.8l4,1.9l-1.7,1l0.8,1l7.2,2.3l-78.9-5.3l-10,3.6l-0.4,4.4L18,31.1l1,1.8l1.7,1.2 l-5.5,4.5l-0.4,5.6L13.8,46l1.8,1.8l-4.4,6.2L22,43.7l1.8-0.5l1.3-1.2l13.4,4l4,4.2l-1.3,14l1.6,2.6l-3.3,1.3L39.4,70l2.7,2.6 L28.6,96.9l1.6,11.2l4.8,5.6l-0.2,3.4l2.5,6.1l-0.5,5l6.6,11.9L38,121.5l1.7-4l3.4,6.1l0.3,2.2l7.1,13.1l1.1,9.2l11.1,8.7l1.6,0.3 l1.3,0.9l5.5,1.2l3.4-0.9l5.5,4.2l0.3,0.5l0.8,0.3l2.1,1.9l5.5,0.5l0.2,0.6l0.8,0.3l4.8,8.9l2.3,1.5l0.2,0.5l7.1,3.4l1.6-1.7 l-5.1-2.2l-1.3-15.6l-6.3-2.2l-3.7,0.3v-4.6l3.7-8.9l-5.2-0.9l-0.5,0.3L83,151l-6.3,2.2l-4-2.8l-3.2-8.9l3.2-11.8l0.5-0.3l0.2-1.2 l2.6-3.1l8.5-3.6l6.3,1.8l4.5-3.1l9.2,1.1l2.5,3.1l1.5,7.8l1.3,1.8l2.1-4.5l-1.1-5l1.6-7l13.7-12.3l0.2-3.7l0.8-1.7l0.9-0.2l0.7,0.5 l0.6-1.9l15-8.8l2.2-3.9l11.9-5.1l-2.2,3.6l11.4-3.8l-5.2-1.7l-1.8-2.8l1.6-4.2l-0.8-0.9h-4.2l0.8-1.5l19.5-3.2l1.6,2.8l-4.5,4.2 l6,1.7l5.3-2.2l-6.3-7.6l4.5-6.1l-1.1-0.6l-0.2-0.5h-3.2l-3.7-13.4l-7.7,3.1l-1.8-1.9l0.2-3.9l-2.3-2.5l-3.4-1.5l-6.6,1.9l-2.1,4.2 l-1.1,0.6l-1.3,2.2l-0.3,3.4l-10,9.5l-0.8,2.8l-1.8,1.9l-2.1,0.3l-1.8-2.5l1.1-4.8l-11.9-6.1l-3.1-5.1l15-12l1.3,0.3l5.1-1.2 l1.1-1.2l0.4-1.2l3.4-0.3l-1.7,4.8L147,34l4.6,0.7l-2.2-2.9l-2.1-1.2l8.2-2.8l0.3-0.6l2-1.7l0.7,0.1l8.1-4.2l7.4,5.3l0.2,1.5l-6,1.5 l-1.8,2.2l3.7,5.3l3.4,1.2l2.3-2.2l2.9-1.2L179,33l-0.2-1.9l7.7-1.7L183.7,25.4 M119.7,74.5l0.8,3.1l1.7,1.8l3.3-0.2l5.4,4.7 l2.7,0.2l-0.5,1.7l-4.7-0.4l0.2-1.2l-2.6-0.9l-2,0.6l-2.6,3.4l3.1,1.7l-3.2,2.3l-2.6-1.2l0.1-9.3l-9.6,9.9L108,88l4.5-7l4.3-2 l-5.1-2.1l-4.8,0.5l0.2-1.7l1.3-1.2l8.7-2.2L119.7,74.5 M205.9,223.1l-1.3,3.1H204l-7.1,11.2l-1.9,18.2l-3.1,6.1h-0.5v0.6l-0.8,0.3 l-1.1,1.2l-2.7-0.3l-9.4,6.7l-7.7,21.6l-3.9,3.3l-5.1-1.1l2.1,3.3l0.5,5.3l-7.9,3.3l-1.4,1.5l-0.5,3.6l-1.1,0.6l-1.1-0.3l-1.8,0.9 l1.8,6.1l-1.8,5.6l3.4,6.1l-2,5.9l0.5,3.1l11.1,8.2l-0.2,0.5l-9.3-0.6l-4.3-5.1l-4.7-1.7l-8.6-17.1l0.5-1.7l-6-12.3l-4.5-56.7 l-12.4-10.2l-4.2-8.1l-0.8-0.6l-9.8-21.5l1.1-2.2l-0.3-2.6l-0.5-0.8l7.9-15.3l0.3-5.6l-1-2.8l1-3.9l1.8-0.3l9.7-8.2l2.1,0.3l0.8,5.1 l2.7-5.1l1.3-0.3l4.2,2.8h0.9l0.2,0.6l14.8,3.9l1.6,1.4l0.3,0.6l7.9,6.7l7.7,0.9l4.3,4l2,6.3l-1,4.6l4.4,1.4l1.1,2.2l5.2-1.1 l2.1,1.1l2.6,4l2.9-0.9l9,1.9l8.6,5.8L205.9,223.1'/></svg>",
                      "asia": "<svg xmlns='http://www.w3.org/2000/svg' version='1.1' viewBox='0 0 584.5 364.5'><path id='asia' d='M322.9,118.9l22.8,42.5l13.5-5.9l16.8-19l-7.3-6.5l-0.7-3.4h-0.1l-5.7,5.2l-0.9,0.1l-3.2-4.4l-0.4-0.2l-0.7,1.7 l-1.2-0.4l-4.1-11.4l0.2-0.5l1.9-1.2l5.1,6.8l6.2,2.7l0.8-0.2l1.1-1.1l1.6,0.4l2.9,2.6l0.4,0.8l16.4,0.8l6.9,6.5l0.4,0.1l1.4-0.3 l0.3,0.1l-1.7,2.5l2.9,2.8h0.7l3.3-3.3l0.5,0.3l9.2,32.1l4,3.7l1.3-1.3h0.2l1.7,1.3l1.4,6.6l1.6,0.9l1.7-2.9l-2.3-7.3l-0.1,0.3v-0.2 l-1.7,0.6l-1.3-1.1l1.2-14.3l14.3-17.6l5.9-1.7l0.3,0.1l3.1,4.5l0.8,0.2l0.9,1.5l0.8,0.3l4.7,10.3l0.2,0.1l2-0.6l5.4,10.1l-0.3,10.5 l2.8,3.7l0,0l4.2,10.8l1.8,1.7l-1.1,2.4l-0.8-0.6l-1.9-4l-1.7-1.4l-0.3-0.9l-5.5-3.5l-2.4-0.3l-0.2,1.2l19.8,28.5l2.6-3.6l-5.7-11.2 l0.9-4l0.7-0.2l0.2-2.3l-9.3-18.6l-0.3-8.9l1.4-1.5l6.7,7.8l1.4,0.3l1.1-0.6l0.1,0.1l-0.2,3.4l0.6,0.5l0.5,0.2l7.4-7.9l-2-10.4 l-6.9-9.5l4.9-6l0.8,0.2l0.8,0.5l1.7,3.9l2.9-4.7l10.1-3.6l5.1-8.1l1.6-9.9l-2.5-2l1.1-1.7l-7.5-11.5l3.5-4.7l-6.1-0.9l-3.5-3.7 l4.1-4.3l0.8-0.1l1.4,0.9l0.6,2.9l2.8-1.3l3.9,1.4l0.9,3.2l2.3,0.5l5,9h0.4l2.3-2.4h0.3l1-1.5l-1.7-3.8l-5.8-5.9l2.1-4v-3.6l2.6-2.4 l0.5,0.1l0.2-0.1l-3.5-15.2l-0.2,0.1v-0.1l-9.3,1.2l-7.3-9.3L464,58.8l-0.8,1.9L441.2,60l-1.5-1.8l-0.2,0.1l0,0l-7.3,4.1l-7.5-3 l-0.5,0.3l-1.8-0.8l-0.9-1.2l-0.3,0.1l-0.1-0.1l-5.7-0.4l-0.3-0.2l0,0l0,0l-1,0.5l-1.5,4.5l-4.2,2.7l-16.8-4.4L377.5,50l0,0l-0.2,1 l1.8,6.7l-13.3,3l-9.2-3.8l-1.1,3.1l-6.7-1.6l-0.1,0.1h-0.2l-4.4,6.8l3.8,3.8l0.6,2.7l0,0l0,0L352,71l2.6,2.2V74l-2.3,1.9l-0.8,1.6 l1.6,3.9l0.9,0.3l1,1.1l2.6,0.9l1.7,1.7l-0.2,1.1l-1.5,2.8l2.1,3.7v4.5l-1.3,1.4l-3.8-0.9l-4.7-5.1v-0.6l-1.4-1.4l-3.9,2.1l-2.4-2.1 l-1.6,0.9l-0.3,5.1l-15.2,4.7l-1.7,9.8l-2.5,1.7L322.9,118.9 M531.1,99.3l-1,2l-4,1.7l-2.4,3l-3.3-2.5l-6.4,0.2l-0.2-0.7l8.9-4.2 l3.7-4.9l-0.6-3.3l-3.2-5.1l-0.7-0.4v-5.1l1.4-2.6l1.7,0.3l0.6,0.7h0.8l1.1,0.8l1.3,0.3l0.6,1.9l-1.7,2l-2.6-1.2L531.1,99.3  M500.5,130.3l1.9-0.9l-0.8,6.3l-1.6-0.3L500.5,130.3 M515.9,180.5l-1.7,0.4l-2.2-3.3l-3.6-2.2l4.3-2.5l0.9-3.1l-0.3-4.1l-4.6-2.1 l-2,0.5l-5.1,8.5l-2.4,0.3l-0.2-3.4l0.8-0.7l4.2-9.3l-1.8-3.7l1.4-9.3l2.4,1.8l1.6,3.6l-0.5,4.8l8,6.4l0.1-0.1l3.1,11.2L515.9,180.5 L515.9,180.5L515.9,180.5 M497.7,179.5l2.6,0.9l1.1,1.9l-1.8,5.1l0.8,7l-6,10.9l-9.2-1.7l-2.9-10.9L497.7,179.5L497.7,179.5  M509,194.8l-1.8,0.1L509,194.8 M515,193.9l-1.7,2.2l-2.4-0.2l-1.9-1.1l-3.3,1.3l-0.3,1.9l1.2,1.4l2.1-0.3l0.9-0.7l1.1,0.1l0.3,1.2 l-1.9,2.6l0.7,5.6l-2.3-2l-1-2l-1.5,1l0.9,5.2l-3.1-0.4l0.2-2.8l-1.4-2.5l2.9-10.5l3.2-1.6l3.8,1.2l3.4-1.1L515,193.9 M530.7,198.1 l2.5,0.5l0.4,0.4l2,5.3l2.1-2.2l4.2-1.7l14.5,11.5l2.4,0.5l4-2.6l-1.2,4.7l-3.5,1.4l-0.5,1.4l0.1,1.3l4.4,6.5l-4.4-1.5l-5.2-7.5 l-5.6,4.4l-5.6-2l-1.2-1.5l1.3-1.5l-1.9-2.4l-0.3-0.8l-8.5-5l-0.9-4.7l-3.4-3.1l2.4-1.4H530.7 M476.6,212.1l19.1,5l3.1-0.8l4.4,1.4 l3.3-0.9l12.4,2.1l-0.1,0.6l-8.2,4v-1.9l-35.4-5.6l-1.5-1.8l2.5-1.9H476.6 M569.4,280.1l-19,14.6l-0.7-1.1l2.2-4.6l5.1-3l7.4-9.7 l0.9-4.3l4.8,5.1L569.4,280.1 M554.3,267.3l-11.1,18.2l-5.7,3.1l-4.8,7.7l-2.5,0.5l-0.6-1.9l0.5-3.4l2.8-2.9l-6.6-0.8l-1.6-1.4 l-1.7-8.4l-0.9-0.9l-3.1,1.1l-5.2-3.9l-32.3,7.3l-2.3-1.9l2.3-4.5l0.6-21.9l1.8-2.5l13.9-6.4l4.3-4.8l0.3-0.9l10-9.2l4.2,1.9l5.5-7 l4.2-1.4l4.9,2l-1.1,5l2.8,4.8l4.5,2.8l3.2-4.5l2.5-11.7l4.6,10.8v7.6l7.7,18.5L554.3,267.3L554.3,267.3L554.3,267.3L554.3,267.3 L554.3,267.3L554.3,267.3'/></svg>",
                      "europe": "<svg xmlns='http://www.w3.org/2000/svg' version='1.1' viewBox='0 0 584.5 364.5'><path id='europe' d='M556.7,26.9l-35.5-7.3l-3.5,1.4l-49.9-5.2l-2.7,2l-45.8-4.1l-1.3-1.9l-15.3-2.2l-0.2,0.1h-0.1l-0.2,0.2l-6,0.6 l-0.5,0.5L372.4,17l-1.7,1.7l-5.8-3.1h-1.7l-1.5,3.7l1.8,2.5l-0.4,0.2l-10.1-1.5l-6.8,1.9l-5.3-0.6l-7.2,2.6l-4.2-1h-0.1l-3.1,3.2 l-0.9,0.2l-2.6,2.2l-2.3,0.8l-1.6,2h-1.7l-5.1-5.1l-1-0.2l-0.1-0.5l1.3-0.9l8.4,1.6l0.5-0.1l2.4-1.8l-0.8-0.9l-20.2-5.5l-16.9,3.4 L268,37l0.8,6.1l3.2,1.7l4-1l1.5,0.9l2.6,5.5h0.8l0.7,1.2l0.8,0.2l7.9-9.7l-2.9-5.4l8.5-8.9h0.5l1.3,1.7l-2.7,6.6l0.8,2.8l11.9,2.4 l-4,1.8l-3.5-0.3l-1.5,1.2l1,1.6l-0.1,2.2l-0.9-0.6H297l-1.8,1.2l-0.5,3.9l-2.3,2.2h-4.3l-4.2,1.9l-6.8-0.7l-0.6-0.4l2.5-1.7 l0.5-1.2l-0.9-1.7l-0.2-0.1l-2.3,0.5l-0.2-0.1l-0.2-3.4l-0.4-0.1l-2.6,3.9l1.3,3.7l-1.4,1.7L269,57l-18.9,13.1l0.1,1l1.7,1.6 l0.8,0.3l1.3,2.2l0.3,3.6l-3.1,4.5l-9.7-0.9l-1.3,1.5L239,97.9l0.4,1.1l5.1,3.1l0.2,0.8l1.6-0.2l0.1-0.2h0.1v-0.1l7.9-4.5l10-14.3 l10-2.8l1.2,0.5l11,11.5l0.2,2.3l-2,1.8l-1.9-0.4l-1.8,0.5l3.8,3.9l1.1-0.7l3.7-5.6l0.2-0.5l-0.9-1.9l0.2-0.4l2.3,0.3l0.8-1 l-1.7-0.9l-8.7-7.6l-0.5-4.5l1.4,0.2l10.4,8l3.4,9l1,0.5l0.5,0.6v1.5l4.5,6.1v0.4l0.7,1.1l3.7,1.3l1.4-1.6l-3.8-2.3l-0.1-1.7 l2.2-2.6l-6.3-6.3l5.6-2.2L306,90l5.8,8l4.2-0.6l2.7,0.9l1,4.7l0.7-0.1l1.8-2l-1.3-1.7l0.2-0.9h4.3l0.3,2.7l15.2-4.7l0.4-5.1 l1.5-0.9l2.5,2l3.9-2.1l1.4,1.5l0.3-3.9l-3.1-5.3l-1.3-8.6l2.9-2.5l-0.6-2.7l-3.8-3.8l4.5-6.9l6.8,1.6l1.1-3.1l9.2,3.8l13.3-3.1 l-1.8-6.7l0.2-1l8.7,7.4l22.2,7.4l4.3-2.7l1.5-4.5l1-0.5l0.2,0.2l6,0.4l1,1.2l1.7,0.8l0.5-0.3l7.5,2.9l7.5-4.2l1.5,1.8l22.1,0.8 l0.7-1.8l23.5-1.4l7,9.2l9.6-1.2l3.4,15.2l1,1.1l-0.2,0.2l1.7,1.7l0.5,0.1l1.8-2.2l1.6-5.3L508,56.7l-2.9-2.2l-5.5,0.3l-2.6-2.5 l1.8-7.8l0.5-0.3l0.2-0.9l3.4-1.7l14.2,0.6l1.3-4.8l1.6-1.2l0.4-0.1l4.3,1.2l0.1-0.1l0.2,0.1l3.1-2.5l1.7,0.9l-1,12l6.9,15.9l3.1-3 l0.1-0.3l2.3,1.1l0.8-2.2l-1.1-8.7l-4.8-5.8l0.1-2.6l0.8-1.5l4.5-2.2l2.2,0.2l4-3.7l2.1-0.3l1.1-1.7l-5.2-2.5l-0.5-1.7l2.9-1.7 l8.2,2.2l0.9-0.2l0.8-1.2L556.7,26.9 M331,87l-11.6-3.1l-8.9,2.9l-0.2-0.1l-0.5-1.9l2.9-7l2.9-2.5h1.7l2.1,1.1l2.3-1.7l1.8-3.4 l1.8-0.6l2.1,0.6l-0.8,3.9l7.7,7.3L331,87 M252.8,18.2l-5.8,5.6l-3.7,1.1l-1.1,4.3l-2.2,1.7l-0.2,1.2l0.9,1.7l7.8,1.2l-2.4,2.9 l-4.6,1.7l-5.9-2.9l2-1.8l1.9-0.8l-2.5-2.1l-11.4,1.7l-4.7,3.1l-8,1.7L203,49l-3.4,0.3l-3.7-2.8l-1.3-10.6l5.2-4.5l1.1-2l-1.9-3.3 l-0.5-0.3v-0.6l-0.5-0.3v-0.6l-0.6-0.3l-1.1-1.4l-3.1-1.4h-5.5l-4-1.7l71.2-3.4L252.8,18.2 M258.9,60.7l0.7,1.2l-10.5,1.5l3.4-1.5 l-0.1-1.5l-2.7-0.9l4.2-4.9l-2.7-2.7l-5.9,7.4l-4.4,0.8l1.1-2.7l-0.2-2.7l8.5-4.8l0.3-3.8l1-1.3l1.3,0.4l0.2,1.1l1.3,0.3l-0.8,3.2 l3.3,2.4l1.7,5.1l2.6,0.9L258.9,60.7'/></svg>"
                    };

                    //let currValue = value[keyEntity];
                    let currValue = correctStub[value[prefixKey]];
                    //value[keyEntity] = "<svg xmlns='http://www.w3.org/2000/svg' version='1.1' viewBox='0 0 833 532'><path id='" + value[prefixKey] + "' d='" + currValue + "'/></svg>";
                    value[keyEntity] = currValue;
                  }
                }
              });
            }

            let unpackedJsonClone = cloneDeep(unpackedJson);
            resp = Utils.mapRows(unpackedJson, self._parsers);

            resp.forEach(function(value){
              for(let objKey in value) {
                if(!(typeof value[objKey] == 'undefined' || value[objKey] === null)) {
                  value[objKey] = value[objKey].toString();
                }
                /*
                if(query.where && query.where['geo.cat']) {
                  value['geo.cat'] = []value[objKey].toString();
                }
                */
              }
            });

            let respClone = cloneDeep(resp);
            console.log("VIZABI::CUSTOM WS READER");
            delete query.key;

            //cache and resolve
            FILE_CACHED[path] = resp;

            self._parse(p, query, resp);
            FILE_REQUESTED[path] = void 0;
          });

          // END :: improvements
      },

      _readCallbackError: function (p, path, query, resp) {
        p.reject({
          'message' : ERROR_NETWORK,
          'data': path
        });
      },

      _parse: function (p, query, resp) {
        var data = resp;
        // sorting
        // one column, one direction (ascending) for now

        if(query.orderBy && data[0]) {
          if (data[0][query.orderBy]) {
            data.sort(function(a, b) {
              return a[query.orderBy] - b[query.orderBy];
            });
          } else {
            return p.reject({
              'message' : ERROR_ORDERING,
              'data': query.orderBy
            });
          }
        }

        this._data = data;
        p.resolve();
      },

      _uzip: function (table) {
        var header;
        var rows = table.rows;
        var headers = table.headers;
        var result = new Array(rows.length);
        // unwrap compact data into json collection
        for (var i = 0; i < rows.length; i++) {
          result[i] = {};
          for (var headerIndex = 0; headerIndex < headers.length; headerIndex++) {
            header = headers[headerIndex];
            result[i][header] = '';
            if (!(typeof rows[i][headerIndex] == 'undefined' || rows[i][headerIndex] === null)) {
              result[i][header] = rows[i][headerIndex].toString();
            }
            if (header === 'geo.cat') {
              result[i][header] = [result[i][header]];
            }
          }
        }
        return result;
      }

    };
  }
}