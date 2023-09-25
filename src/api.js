/******************************************************************************\

                  Copyright 2018-2023. Cauldron Development LLC
                              All Rights Reserved.

                  For information regarding this software email:
                                 Joseph Coffland
                          joseph@cauldrondevelopment.com

        This software is free software: you can redistribute it and/or
        modify it under the terms of the GNU Lesser General Public License
        as published by the Free Software Foundation, either version 2.1 of
        the License, or (at your option) any later version.

        This software is distributed in the hope that it will be useful,
        but WITHOUT ANY WARRANTY; without even the implied warranty of
        MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
        Lesser General Public License for more details.

        You should have received a copy of the GNU Lesser General Public
        License along with the C! library.  If not, see
        <http://www.gnu.org/licenses/>.

\******************************************************************************/

import {reactive} from 'vue'
import util from './util.js'


class API {
  constructor(ctx, url, timeout = 24 * 60 * 60 * 1000) {
    this.url      = url
    this.cache    = ctx.$cache
    this.timeout  = timeout
    this.sid      = util.retrieve('fah-sid', 0)
    this.data     = reactive({causes: []})

    this._error_handler = (action, error) => {
      console.error(action + ' failed with "' + error + '"')
      throw {action, error}
    }

    this._check_version()
    this._update_causes()
  }


  sid_clear() {
    util.remove('fah-sid')
    delete this.sid
  }


  sid_save(sid) {
    this.sid = sid
    util.store('fah-sid', sid)
  }


  get_release() {
    switch (location.hostname) {
    case 'alpha.foldingathome.org': return 'alpha'
    case 'beta.foldingathome.org':  return 'beta'
    case 'app.foldingathome.org':   return 'beta'
    default:                        return 'public'
    }
  }


  get_download_url() {
    const release = this.get_release()
    const base    = 'https://foldingathome.org/'

    if (release == 'public') return base + 'start-folding/'
    return base + release + '/'
  }


  get_latest_version() {return this.data.latest_version}


  async _check_version() {
    this.data.latest_version = await this.cache.get('latest-version')
    if (this.data.latest_version != undefined) return

    const release = this.get_release()
    const url = 'https://download.foldingathome.org/?release=' + release
    let r = await fetch(url)
    let downloads = await r.json()

    for (let download of downloads)
      for (let group of (download.groups || []))
        for (let file of (group.files || []))
          if (file.version != undefined && file.version.length == 3) try {
            let version = file.version.join('.')
            this.cache.set('latest-version', version)
            this.data.latest_version = version
            return
          } catch (e) {}
  }


  get_causes() {return this.data.causes}


  async _update_causes() {
    let causes = await this.fetch({
      path: '/project/cause', action: 'Getting project causes',
      expire: this.timeout})

    delete causes[0]
    causes = Object.values(causes).sort()
    causes.unshift('any')

    for (let cause of causes)
      this.data.causes.push(cause)
  }


  set_error_handler(handler) {this._error_handler = handler}


  async error(response, path, method, data, action, cb) {
    action = action || ('API call ' + method + ' ' + path)
    let error = data ? data.error : response.statusText

    if (cb) {
      let ret = cb(action, error, response)
      if (ret === false) return
    }

    let ret = this._error_handler(action, error)
    if (ret !== false) throw {action, error}
  }


  async fetch(args) {
    const {path, method = 'GET', data, action, expire, error_cb} = args
    let url    = new URL(this.url + path)
    let config = {method, headers: {}, credentials: 'include'}

    if (this.sid) config.headers.Authorization = this.sid

    if (data) {
      if (method == 'GET' || method == 'DELETE')
        url.search = new URLSearchParams(data).toString()

      else {
        config.headers['Content-Type'] = 'application/json'
        if (data) config.body = JSON.stringify(data)
      }
    }

    if (expire != undefined) {
      let content = await this.cache.get(url, expire)
      if (content != undefined) return content
    }

    let r = await fetch(url, config)
    let error = async (r, data) => {
      return this.error(r, path, method, data, action, error_cb)
    }

    if (r.headers.get('Content-Type') == 'application/json') {
      if (!r.ok) return error(r, await r.json())

      let content = await r.json()
      if (expire != undefined) await this.cache.set(url, content)

      return content

    } else if (!r.ok) return error(r)
  }


  async get(path, data, action) {
    return this.fetch({path, method: 'GET', data, action})
  }


  async put(path, data, action) {
    return this.fetch({path, method: 'PUT', data, action})
  }


  async post(path, data, action) {
    return this.fetch({path, method: 'POST', data, action})
  }


  async delete(path, data, action) {
    return this.fetch({path, method: 'DELETE', data, action})
  }
}


export default API
