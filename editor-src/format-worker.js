import init, {format} from '@wasm-fmt/clang-format/web';
let ready;
self.onmessage = async ({data}) => {
  try {
    ready ??= init(new URL('./clang-format.wasm', self.location.href));
    await ready;
    const code = format(data.code, 'solution.cpp', JSON.stringify({
      BasedOnStyle:'LLVM', IndentWidth:data.indent, TabWidth:data.indent,
      UseTab:'Never', ColumnLimit:100, SortIncludes:'Never',
      AllowShortFunctionsOnASingleLine:'Empty', AllowShortIfStatementsOnASingleLine:'Never',
    }));
    self.postMessage({id:data.id, code});
  } catch (error) {
    ready = undefined;
    self.postMessage({id:data.id, error:String(error.message || error)});
  }
};
