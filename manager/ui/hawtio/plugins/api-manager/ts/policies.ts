/// <reference path="apimanPlugin.ts"/>
/// <reference path="services.ts"/>
module Apiman {
    
    _module.controller("Apiman.DefaultPolicyConfigFormController",
        ['$scope', 'Logger',
        ($scope, Logger) => {
            var validateRaw = function(config) {
                var valid = true;
                try {
                    var parsed = JSON.parse(config);
                    $scope.config = parsed;
                } catch (e) {
                    valid = false;
                }
                $scope.setValid(valid);
            };
            $scope.$watch('rawConfig', validateRaw);
        }]);

    _module.controller("Apiman.JsonSchemaPolicyConfigFormController",
        ['$scope', 'Logger', 'PluginSvcs',
        ($scope, Logger, PluginSvcs) => {
            var initEditor = function(schema) {
                var holder = document.getElementById('json-editor-holder');
                var editor = new window['JSONEditor'](holder, {
                    // Disable fetching schemas via ajax
                    ajax: false,
                    // The schema for the editor
                    schema: schema,
                    // Disable additional properties
                    no_additional_properties: true,
                    // Require all properties by default
                    required_by_default: true,
                    disable_edit_json: true,
                    disable_properties: true,
                    iconlib: "fontawesome4",
                    theme: "bootstrap3"
                });
                editor.on('change', function() {
                    $scope.$apply(function() {
                        // Get an array of errors from the validator
                        var errors = editor.validate();
                        // Not valid
                        if (errors.length) {
                            $scope.setValid(false);
                        } else {
                            $scope.setValid(true);
                            $scope.setConfig($scope.editor.getValue());
                        }
                    });
                });
                $scope.editor = editor;
            };
            var destroyEditor = function() {
                $scope.editor.destroy();
            };
            
            $scope.$on('$destroy', function() {
                Logger.debug('Destroying the json-editor!');
                destroyEditor();
            });
            
            $scope.schemaState = 'loading';
            var pluginId = $scope.selectedDef.pluginId;
            var policyDefId = $scope.selectedDef.id;
            PluginSvcs.getPolicyForm(pluginId, policyDefId, function(schema) {
                Logger.debug("Schema: {0}", schema);
                initEditor(schema);
                $scope.editor.setValue($scope.config);
                $scope.schemaState = 'loaded';
            }, function (error) {
                // TODO handle the error better here!
                Logger.error(error);
                $scope.schemaState = 'loaded';
            });
        }]);

    _module.controller("Apiman.RateLimitingFormController",
        ['$scope', 'Logger',
        ($scope, Logger) => {
            var validate = function(config) {
                var valid = true;
                if (!config.limit || config.limit < 1) {
                    valid = false;
                }
                if (!config.granularity) {
                    valid = false;
                }
                if (!config.period) {
                    valid = false;
                }
                $scope.setValid(valid);
            };
            $scope.$watch('config', validate, true);
        }]);

    _module.controller("Apiman.IPListFormController",
        ['$scope', 'Logger',
        ($scope, Logger) => {
            var validate = function(config) {
                var valid = true;
                $scope.setValid(valid);
            };
            $scope.$watch('config', validate, true);
            
            if (!$scope.config.ipList) {
                $scope.config.ipList = [];
            }
            
            $scope.add = function(ip) {
                $scope.remove(ip);
                $scope.config.ipList.push(ip);
                $scope.selectedIP =  [ ip ];
                $scope.ipAddress = undefined;
                $('#ip-address').focus();
            };
            
            $scope.remove = function(ips) {
                angular.forEach(ips, function(ip) {
                    var idx = -1;
                    angular.forEach($scope.config.ipList, function(item, index) {
                        if (item == ip) {
                            idx = index;
                        }
                    });
                    if (idx != -1) {
                        $scope.config.ipList.splice(idx, 1);
                    }
                });
                $scope.selectedIP = undefined;
            };
            
            $scope.clear = function() {
                $scope.config.ipList = [];
                $scope.selectedIP = undefined;
            };
        }]);

    _module.controller("Apiman.IgnoredResourcesFormController",
        ['$scope', 'Logger',
        ($scope, Logger) => {
            var validate = function(config) {
                var valid = true;
                $scope.setValid(valid);
            };
            $scope.$watch('config', validate, true);
            
            $scope.add = function(path) {
                if (!$scope.config.pathsToIgnore) {
                    $scope.config.pathsToIgnore = [];
                }
                $scope.remove(path);
                $scope.config.pathsToIgnore.push(path);
                $scope.selectedPath =  [ path ];
                $scope.path = undefined;
                $('#path').focus();
            };
            
            $scope.remove = function(paths) {
                angular.forEach(paths, function(path) {
                    var idx = -1;
                    angular.forEach($scope.config.pathsToIgnore, function(item, index) {
                        if (item == path) {
                            idx = index;
                        }
                    });
                    if (idx != -1) {
                        $scope.config.pathsToIgnore.splice(idx, 1);
                    }
                });
                $scope.selectedPath = undefined;
            };
            
            $scope.clear = function() {
                $scope.config.pathsToIgnore = [];
                $scope.selectedPath = undefined;
            };
        }]);

    _module.controller("Apiman.BasicAuthFormController",
        ['$scope', 'Logger',
        ($scope, Logger) => {
            var validate = function(config) {
                var valid = true;
                if (!config.realm) {
                    valid = false;
                }
                
                if (!config.staticIdentity && !config.ldapIdentity && !config.jdbcIdentity) {
                    valid = false;
                }
                
                if (config.staticIdentity) {
                    if (!config.staticIdentity.identities) {
                        valid = false;
                    }
                }
                if (config.ldapIdentity) {
                    if (!config.ldapIdentity.url) {
                        valid = false;
                    }
                    if (!config.ldapIdentity.dnPattern) {
                        valid = false;
                    }
                    if (config.ldapIdentity.bindAs == 'ServiceAccount') {
                        if (!config.ldapIdentity.credentials || !config.ldapIdentity.credentials.username || !config.ldapIdentity.credentials.password) {
                            valid = false;
                        }
                        if (!config.ldapIdentity.userSearch || !config.ldapIdentity.userSearch.baseDn || !config.ldapIdentity.userSearch.expression) {
                            valid = false;
                        }
                    }
                    if (config.ldapIdentity.extractRoles) {
                        if (!config.ldapIdentity.membershipAttribute) {
                            valid = false;
                        }
                        if (!config.ldapIdentity.rolenameAttribute) {
                            valid = false;
                        }
                    }
                }
                if (config.jdbcIdentity) {
                    if (!config.jdbcIdentity.datasourcePath) {
                        valid = false;
                    }
                    if (!config.jdbcIdentity.query) {
                        valid = false;
                    }
                    if (config.jdbcIdentity.extractRoles && !config.jdbcIdentity.roleQuery) {
                        valid = false;
                    }
                }
                $scope.setValid(valid);
            };
            $scope.$watch('config', validate, true);
            
            if ($scope.config.staticIdentity) {
                $scope.identitySourceType = 'static';
            } else if ($scope.config.ldapIdentity) {
                $scope.identitySourceType = 'ldap';
            } else if ($scope.config.jdbcIdentity) {
                $scope.identitySourceType = 'jdbc';
            }
            
            $scope.$watch('identitySourceType', function(newValue) {
                if (newValue) {
                    if (newValue == 'static' && !$scope.config.staticIdentity) {
                        $scope.config.staticIdentity = new Object();
                        delete $scope.config.ldapIdentity;
                        delete $scope.config.jdbcIdentity;
                    } else if (newValue == 'jdbc' && !$scope.config.jdbcIdentity) {
                        $scope.config.jdbcIdentity = new Object();
                        $scope.config.jdbcIdentity.hashAlgorithm = 'SHA1';
                        delete $scope.config.staticIdentity;
                        delete $scope.config.ldapIdentity;
                    } else if (newValue == 'ldap' && !$scope.config.ldapIdentity) {
                        $scope.config.ldapIdentity = new Object();
                        $scope.config.ldapIdentity.bindAs = 'UserAccount';
                        delete $scope.config.staticIdentity;
                        delete $scope.config.jdbcIdentity;
                    }
                }
            });

            $scope.add = function(username, password) {
                var item = {
                    username: username,
                    password: password
                };
                if (!$scope.config.staticIdentity.identities) {
                    $scope.config.staticIdentity.identities = [];
                }
                $scope.remove([ item ]);
                $scope.config.staticIdentity.identities.push(item);
                $scope.selectedIdentity =  [ item ];
                $scope.username = undefined;
                $scope.password = undefined;
                $('#username').focus();
            };
            
            $scope.remove = function(selectedIdentities) {
                angular.forEach(selectedIdentities, function(identity) {
                    var idx = -1;
                    angular.forEach($scope.config.staticIdentity.identities, function(item, index) {
                        if (item.username == identity.username) {
                            idx = index;
                        }
                    });
                    if (idx != -1) {
                        $scope.config.staticIdentity.identities.splice(idx, 1);
                    }
                });
                $scope.selectedIdentity = undefined;
            };
            
            $scope.clear = function() {
                $scope.config.staticIdentity.identities = [];
                $scope.selectedIdentity = undefined;
            };

        }]);

    _module.controller("Apiman.AuthorizationFormController",
        ['$scope', 'Logger',
        ($scope, Logger) => {
            var validate = function(config) {
                var valid = config.rules && config.rules.length > 0;
                $scope.setValid(valid);
            };
            $scope.$watch('config', validate, true);
            
            $scope.add = function(path, verb, role) {
                if (!$scope.config.rules) {
                    $scope.config.rules = [];
                }
                var rule = {
                    "verb" : verb,
                    "pathPattern" : path,
                    "role" : role
                };
                $scope.config.rules.push(rule);
                $scope.path = undefined;
                $scope.verb = undefined;
                $scope.role = undefined;
                $('#path').focus();
            };
            
            $scope.remove = function(selectedRule) {
                var idx = -1;
                angular.forEach($scope.config.rules, function(item, index) {
                    if (item == selectedRule) {
                        idx = index;
                    }
                });
                if (idx != -1) {
                    $scope.config.rules.splice(idx, 1);
                }
            };
            
            $scope.clear = function() {
                $scope.config.rules = [];
            };
        }]);

}
