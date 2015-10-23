/**
 * @license
 * Copyright (c) 2015 C&C Technology sp. z o.o.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

var
    esprima = require('esprima'),
    _ = require('lodash'),
    fs = require('fs');

/**
 * This is a specialized class used for digging some information from a JS code.
 * Internally uses esprima to parse JS into JSON and token structure.
 * The implementation assumes that the class will have at least a structure like:
 *
 * class Icon {
 *      beforeRegister() {    
 *          this.properties = {}; <- Polymer properties object written in plain ES5
 *          this.is = 'my-component';
 *      }
 * }
 *
 * or
 *
 * class Icon {
 *      get properties() {
 *          return {} <- Polymer properties object written in plain ES5
 *      }
 *      get is() { return 'my-component'; }
 * }
 *
 * @param code JS code in a string
 * @constructor
 * @author b.wojtkowiak@cctechnology.pl
 */
function PolymerES2015ClassParser(code) {
    // Strip ES7 decorators
    code = code.replace(/\n[ \t]+@[a-zA-Z]+(\(.+\))?( +)?$/gmi, "\n");

    // Replace ES7 class properties with getters
    code = code.replace(/^[ \t]+([a-zA-Z\$\_][a-zA-Z0-9]+) = ([^;]+;)/gmi, 'get $1() { return $2 }\n');
    code = code.replace(/^[ \t]+([a-zA-Z\$\_][a-zA-Z0-9]+);([ \t]+)?$/gmi, 'get $1() { return undefined; }\n');

    // Parse the code. Esprima options will give us comments, ranges (coordinates in code) and language token array.
    try {
        this.file = esprima.parse(code, {attachComment: true, comment: true, range: true, tokens: true});
    } catch (e) {
        // Leaving it here intentionally so in case of error, you will be able to see what code was actually passed to Esprima.
        console.log(code);
        throw "Invalid js syntax: " + e;
    }

    this._beforeRegisterMethodBody = null;
    // Leaving it here intentionally, so in case of any problems you can easily check the file structure and adjust the code
    //fs.writeFileSync('./' + this._getClassName() + '.json', JSON.stringify(this.file), 'utf-8');

    this.behavior = this._getClassName().indexOf('Behavior') !== -1;

    return {
        isBehavior: this.behavior,
        behaviors: this._getBehaviors(),
        className: this._getClassName(),
        is: this._getIs(),
        properties: this._getProperties(),
        methods: this._getMethods(),
        events: this._getEvents(),
        firstComment: (this.file.comments && Array.isArray(this.file.comments) && this.file.comments.length > 0) ? this.file.comments[0].value : ''
    };

}

PolymerES2015ClassParser.prototype._getBehaviors = function () {
    var behaviors = [];

    _.forEach(this.classBody, function (element) {
        if (element.type && element.type === "MethodDefinition") {
            if (element.key && element.key.name && element.key.name === 'behaviors') {
                var elements = element.value.body.body[0].argument.elements;
                console.log(elements);
                for (var i = 0; i < elements.length; i++) {
                    behaviors.push(elements[i].name);
                }
                return false;
            }
        }
    });

    return behaviors;
};

/**
 * Searches for comment blocks with @event
 *
 * @param range array with character coordinates [start, end]
 * @returns {string}
 * @private
 */
PolymerES2015ClassParser.prototype._getEvents = function () {
    var events = [];
    _.forEach(this.file.comments, function (comment) {
        if (comment.value.indexOf('@event') > -1) {
            events.push(comment.value);
        }
    });
    return events;
};

/**
 * Searches the parsed code for the class name.
 *
 * @returns {string}
 * @private
 */
PolymerES2015ClassParser.prototype._getClassName = function () {
    var self = this, className = '';
    _.forEach(this.file.body, function (element) {
        if (element.type && element.type == "ClassDeclaration") {
            self.classBody = element.body.body;
            className = element.id.name;
            return false;
        }
    });
    if (className !== '') {
        return className;
    }
    throw "Could not find class name.";
};

/**
 * Rebuilds a fragment of the original code within the provided range.
 *
 * @param range array with character coordinates [start, end]
 * @returns {string}
 * @private
 */
PolymerES2015ClassParser.prototype._getCodeFragment = function (range) {
    var buf = '';
    _.forEach(this.file.tokens, function (token) {
        if (token.range[0] >= range[0] && token.range[1] <= range[1]) {
            buf += ' ' + token.value;
        }
    });
    return buf;
};

/**
 * Searches for the beforeRegister method
 *
 * @returns {Array}
 * @private
 */
PolymerES2015ClassParser.prototype._findBeforeRegisterMethod = function () {
    var self = this;

    _.forEach(this.classBody, function (element) {
        if (element.type && element.type === "MethodDefinition") {
            if (element.key && element.key.name && element.key.name === 'beforeRegister') {
                self._beforeRegisterMethodBody = element.value.body.body;
                return false;
            }
        }
    });

};

/**
 * Checks if provided block is an assigment to this.<propertyName>
 */
PolymerES2015ClassParser.prototype._isAssignmentToProperty = function (block, propertyName) {
    return block.type === "ExpressionStatement" &&
        block.expression.left.type === "MemberExpression" &&
        block.expression.left.object.type === "ThisExpression" &&
        block.expression.left.property.type === "Identifier" &&
        block.expression.left.property.name === propertyName;
}

/**
 * Searches for the properties assignment in beforeRegister method.
 *
 * @returns {Array}
 * @private
 */
PolymerES2015ClassParser.prototype._getProperties = function () {

    var self = this, properties = [], propertiesSource = null;

    _.forEach(this._beforeRegisterMethodBody, function (block) {
        if (self._isAssignmentToProperty(block, 'properties')) {
            propertiesSource = block.expression.right.properties;
            return false;
        }
    });

    if (!propertiesSource || !_.isArray(propertiesSource)) {
        return this._getPropertiesFromGetter();
    }

    if (propertiesSource.length === 0) {
        return properties;
    }

    _.forEach(propertiesSource, function (property) {
        properties.push({
            comment: (property.leadingComments) ? property.leadingComments[0].value : null,
            code: self._getCodeFragment(property.range)
        })
    });

    return properties;
};

/**
 * Searches for the properties getter just to copy the declaration.
 *
 * @returns {Array}
 * @private
 */
PolymerES2015ClassParser.prototype._getPropertiesFromGetter = function () {

    var self = this, properties = [], propertiesSource = null;
    _.forEach(this.classBody, function (element) {
        if (element.type && element.type === "MethodDefinition") {
            if (element.key && element.key.name && element.key.name === 'properties') {
                propertiesSource = element.value.body.body;
                return false;
            }
        }
    });

    if (!propertiesSource || !_.isArray(propertiesSource) || propertiesSource.length == 0) {
        return [];
    }

    if (!propertiesSource[0].type || propertiesSource[0].type !== 'ReturnStatement') {
        throw "Return should be the first instruction in properties getter.";
    }

    if (!propertiesSource[0].argument || !propertiesSource[0].argument.type || propertiesSource[0].argument.type !== 'ObjectExpression') {
        throw "Return in properties getter should always return an object.";
    }

    if (!propertiesSource[0].argument.properties || propertiesSource[0].argument.properties.length === 0) {
        return properties;
    }

    _.forEach(propertiesSource[0].argument.properties, function (property) {
        properties.push({
            comment: (property.leadingComments) ? property.leadingComments[0].value : null,
            code: self._getCodeFragment(property.range)
        })
    });

    return properties;
};

/**
 * Lists method arguments names.
 *
 * @param params params array from esprima MethodDefinition object
 * @returns {string}
 * @private
 */
PolymerES2015ClassParser.prototype._getMethodArguments = function (params) {
    var output = '';
    _.forEach(params, function (param) {
        output += ((output !== '') ? ', ' : '') + param.name;
    });
    return output;
};

/**
 * Lists all the methods in the class.
 *
 * @returns {Array}
 * @private
 */
PolymerES2015ClassParser.prototype._getMethods = function () {
    var self = this, methods = [];

    _.forEach(this.classBody, function (element) {

        if (element.type && element.type === 'MethodDefinition' && element.kind !== 'get' && element.kind !== 'set') {

            if (element.key && element.key.name && element.key.name !== 'beforeRegister' && element.key.name !== 'constructor') {

                methods.push({
                    comment: (element.leadingComments) ? element.leadingComments[0].value : null,
                    name: element.key.name,
                    declaration: self._getMethodArguments(element.value.params)

                });

            }
        }

    });

    return methods;
};

/**
 * Searches for the 'is' assignment in beforeRegister method.
 *
 * @returns {string}
 * @private
 */
PolymerES2015ClassParser.prototype._getIs = function () {
    if (this.behavior) {
        return '';
    }

    var is = '', self = this;

    this._findBeforeRegisterMethod();

    if (!this._beforeRegisterMethodBody) {
        return this._getIsFromGetter();
    }

    _.forEach(this._beforeRegisterMethodBody, function (block) {
        if (self._isAssignmentToProperty(block, 'is')) {
            is = block.expression.right.value;
            return false;
        }
    });

    if (is === '') {
        return this._getIsFromGetter();
    }

    return is;
};

/**
 * Searches for the 'is' getter which defines component tag name.
 *
 * @returns {string}
 * @private
 */
PolymerES2015ClassParser.prototype._getIsFromGetter = function () {
    var self = this, is = '';

    _.forEach(this.classBody, function (element) {
        if (element.type && element.type === "MethodDefinition") {
            if (element.key && element.key.name && element.key.name === 'is') {
                is = element.value.body.body[0].argument.value;
                return false;
            }
        }
    });

    if (is === '') {
        throw "No 'is' getter or this.is in beforeRegister. Invalid Polymer class.";
    }

    return is;
};

module.exports = PolymerES2015ClassParser;
