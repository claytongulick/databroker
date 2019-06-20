"use strict";

//TODO: this needs to be moved to binding since it relys on a ton of native web funcationality - fetch, FormData, encodeURIComponent, etc..

import DataWipe from './isolate-data_wipe';
import ApplicationState from './isolate-application_state';

//we have a base url here so that we can issue explicit calls to an ip for testing, if needed
let config = {
    base_url: ''
    //base_url: 'http://192.168.1.3:3000/'
    //base_url: 'http://localhost:3000/'
    // base_url: 'http://10.0.2.2:3000/'
    // base_url: 'https://192.168.1.152:3000/'
};

/**
 * Data broker class, handles communication to the server and returns a promise.
 * Thin wrapper around fetch api.
 * Adds credentials to all requests.
 * Eventual expansion to support caching, etc...
 */
class Broker {

    /** Provide a singleton pattern, if needed */
    static getInstance() {
        if (!Broker._instance)
            Broker._instance = new Broker();
        return Broker._instance;
    }

    constructor() {
        this.base_url = config.base_url;
    }

    addEventListener(event_name, listener) {
        if (!this._listeners)
            this._listeners = {};
        if (!this._listeners[event_name])
            this._listeners[event_name] = [];
        this._listeners[event_name].push(listener);
    }

    dispatchEvent(event_name, data) {
        if (!(this._listeners && this._listeners[event_name] && this._listeners[event_name].length))
            return;

        this._listeners[event_name].forEach(
            (listener) => listener(data)
        );
    }

    /**
     * Serialize an object to form data for multipart/form-data
     * @param object
     * @returns {string}
     */
    objectToFormData(object) {
        if ((object === undefined) || (object === null)) return '';
        if (typeof object !== 'object') return '';

        let form_data = new FormData();

        Object.keys(object).forEach(
            key => {
                    let val = object[key];
                    if (typeof val !== 'string') {
                        val = JSON.stringify(val);
                    form_data.set(key, val);
                }
        });
        return form_data;
    }

    serializeParams(params) {
        if(!params)
            return '';
        let serialized = Object.keys(params)
            .map(
                key => {
                    let val = params[key];
                    if (typeof val !== 'string') {
                        val = JSON.stringify(val);
                    }
                    return [key, val].map(encodeURIComponent)
                        .join("=")
                }
                ).join("&");  
        return serialized;
    }

    getBody(data, options) {
        let body = "";
        if (typeof data === 'string')
            body = data;
        if (typeof data === 'object' && options.json)
            body = JSON.stringify(data);
        if (typeof data === 'object' && (!options.json)) {
            if (options.multipart) {
                body = this.objectToFormData(data);
            }
            else {
                body = this.serializeParams(data);
            }
        }

        return body;
    }

    /**
     * Issue http GET, returns promise
     * @param url
     * @param data
     * @returns {*}
     */
    async get(url, data) {
        this.dispatchEvent('loading');
        try {

            let query_string = this.serializeParams(data);
            if (data) query_string = "?" + query_string;
            let get_url = this.base_url + url + query_string;
            const response = await fetch(get_url,
                {
                    method: 'get',
                    headers: this.getHeaders(),
                    cache: 'no-store',
                    credentials: 'include'
                });
            let response_body = await this.handleResponse(response);
            this.dispatchEvent('loading_complete');
            return response_body;
        }
        catch (err) {
            this.dispatchEvent('loading_complete');
            throw err;
        }
    }

    /**
     * Issue http PUT, returns promise
     * @param url
     * @param data
     * @param serialize_json
     * @returns {*}
     */
    async put(url, data, options) {
        let default_options = {
            json: false,
            multipart: false
        }
        options = Object.assign(default_options, options);
        this.dispatchEvent('loading');
        try {
            let put_url = this.base_url + url;
            const response = await fetch(put_url,
                {
                    method: 'put',
                    headers: this.getHeaders(options),
                    cache: 'no-store',
                    credentials: 'include',
                    body: this.getBody(data, options)
                });

            let response_body = await this.handleResponse(response);
            this.dispatchEvent('loading_complete');
            return response_body;
        }
        catch (err) {
            this.dispatchEvent('loading_complete');
            throw err;
        }
    }

    /**
     * Issue http POST, returns promise
     * @param url
     * @param data
     * @param serialize_json
     * @returns {*}
     */
    async post(url, data, options) {
        let default_options = {
            json: false,
            multipart: false
        }
        options = Object.assign(default_options, options);
        this.dispatchEvent('loading');
        try {
            let post_url = this.base_url + url;
            const response = await fetch(post_url,
                {
                    method: 'post',
                    headers: this.getHeaders(options),
                    cache: 'no-store',
                    credentials: 'include',
                    body: this.getBody(data, options)
                });

            let response_body = await this.handleResponse(response);
            this.dispatchEvent('loading_complete');
            return response_body;
        }
        catch (err) {
            this.dispatchEvent('loading_complete');
            throw err;

        }
    }

    /**
     * Send a RFC 6902 compliant json-patch document to the server
     * @param {*} url 
     * @param {*} patch 
     * @param {*} options 
     */
    async patch(url, patch) {
        let options = {
            json: true,
            multipart: false
        };
        this.dispatchEvent('loading');
        try {
            let patch_url = this.base_url + url;
            const response = await fetch(patch_url,
                {
                    method: 'patch',
                    headers: this.getHeaders(options),
                    cache: 'no-store',
                    credentials: 'include',
                    body: this.getBody(data, options)
                });

            let response_body = await this.handleResponse(response);
            this.dispatchEvent('loading_complete');
            return response_body;
        }
        catch (err) {
            this.dispatchEvent('loading_complete');
            throw err;
        }
    }

    /**
     * Issue http DELETE, returns promise
     *
     * Using the name del instead of delete because 'delete' is a reserved keyword
     * @param url
     * @param data
     * @returns {*}
     */
    async del(url, data) {
        this.dispatchEvent('loading');
        try {
            let query_string = data ? this.serialize(data) : "";
            if (data) query_string = "?" + query_string;
            let get_url = this.base_url + url + query_string;
            const response = await fetch(get_url,
                {
                    method: 'delete',
                    headers: this.getHeaders(),
                    cache: 'no-store',
                    credentials: 'include'
                });

            let response_body = await this.handleResponse(response);
            this.dispatchEvent('loading_complete');
            return response_body;
        }
        catch (err) {
            this.dispatchEvent('loading_complete');
            throw err;

        }
    }

    getHeaders(options) {
        let default_options = {
            json: false,
            multipart: false
        }
        options = Object.assign(default_options, options);
        let content_type = 'application/x-www-form-urlencoded';
        if(options.json)
            content_type = 'application/json';
        if(options.multipart)
            content_type = 'multipart/form-data';

        let header_token = ApplicationState.get('app.jwt') || "";
        return {
            'Cache-Control': 'no-cache',
            'Accept': 'application/json',
            'Content-Type': content_type,
            'Authorization': 'Bearer ' + header_token
        }
    }

    async handleResponse(response) {
        const status = response.status;

        switch (status) {
            case 401: //forbidden - for missing credentials
                this.dispatchEvent('missing_credentials');
                throw new Error("401 forbidden")
                break;
            case 403: //unauthorized - don't have permission
                this.dispatchEvent('unauthorized');
                throw new Error("403 unauthorized")
                break;
            case 451: //burn baby, burn - remote wipe
                this.handleRemoteWipe();
                throw new Error("451 remote wipe")
                break;
            default: //check for success
                let body = await response.json();
                if (!response.ok) {
                    throw new Error(`${response.status}: ${response.statusText} -- ${JSON.stringify(body)}`);
                }
                return body;
                break;
        }

    }

    handleRemoteWipe() {
        DataWipe.wipeDeviceData();
    }

}

export default Broker.getInstance();
