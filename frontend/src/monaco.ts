import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import CssWorker from 'monaco-editor/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'
import TypeScriptWorker from 'monaco-editor/language/typescript/ts.worker?worker'

self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    switch (label) {
      case 'css':
      case 'less':
      case 'scss':
        return new CssWorker()
      case 'html':
      case 'handlebars':
      case 'razor':
        return new HtmlWorker()
      case 'json':
        return new JsonWorker()
      case 'javascript':
      case 'typescript':
        return new TypeScriptWorker()
      default:
        return new EditorWorker()
    }
  },
}

loader.config({ monaco })