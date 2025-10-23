import Module from 'node:module';

type ModuleWithExtensions = {
  _extensions?: NodeJS.RequireExtensions;
};

const moduleWithExtensions = Module as unknown as ModuleWithExtensions;
const extensions = moduleWithExtensions._extensions;

if (extensions) {
  extensions['.css'] = () => undefined;
}
