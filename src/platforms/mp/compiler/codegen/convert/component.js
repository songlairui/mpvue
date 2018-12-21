import { replaceVarSimple, getBindings, getClosestFor } from '../utils.scopeslot'

function getSlotsName (obj) {
  if (!obj) {
    return ''
  }
  // wxml模板中 data="{{ a:{a1:'string2'}, b:'string'}}" 键a不能放在最后，会出错
  return tmplateSlotsObj(obj)
    .concat(
      Object.keys(obj).map(function(k) {
        return '$slot' + k + ":'" + obj[k] + "'"
      })
    )
    .join(',')
}

function tmplateSlotsObj(obj) {
  if (!obj) {
    return []
  }
  // wxml模板中 data="{{ a:{a1:'string2'}, b:'string'}}" 键a1不能写成 'a1' 带引号的形式，会出错
  const $for = Object.keys(obj)
    .map(k => {
      return `${k}:'${obj[k]}'`
    })
    .join(',')
  return $for ? [`$for:{${$for}}`] : []
}

export default {
  isComponent (tagName, components = {}) {
    return !!components[tagName]
  },
  convertComponent (ast, components, slotName) {
    const { attrsMap, tag, mpcomid, slots, attrsList } = ast
    if (slotName) {
      // 检查插槽是否含有绑定数据
      const hasDataBinding = getBindings(ast.attrsList).length
      const closestForNode = getClosestFor(ast)
      if (hasDataBinding) {
        let genKeyStr = v => v
        if (closestForNode) {
          // 有 v-for 场景，替换模板中约定的slot-scope。因slot只有一份，采用slot-scope统一成一个的处理方式
          const { alias, for: forName, iterator1 } = closestForNode
          const aliasFull = `${forName}[${iterator1}]`
          genKeyStr = replaceVarSimple(alias, aliasFull)
        }
        const varRootStr = '$root[$k]'
        let $scopeStr = '{ '
        attrsList.forEach(({ name, value }) => {
          let bindTarget = false
          if (name.startsWith(':')) {
            bindTarget = name.slice(1)
          } else if (name.startsWith('v-bind')) {
            bindTarget = name.slice('v-bind'.length + 1)
          } else {
            // 非动态绑定attr
            $scopeStr += `name: '${value}' ,`
          }
          if (bindTarget === false) return
          const pathStr = genKeyStr(value)
          // 区分取变量方式：$root[$k].data 或 $root[$k][idx]
          const varSep = pathStr[0] === '[' ? '' : '.'
          const bindValStr = `${varRootStr}${varSep}${pathStr} ,`
          if (bindTarget === '') {
            // v-bind="data" 情况
            $scopeStr += `...${bindValStr}`
          } else {
            // v-bind:something="varible" 情况
            $scopeStr += `${bindTarget}: ${bindValStr}`
          }
        })
        $scopeStr = $scopeStr.replace(/,?$/, ' }')
        // 有 slot-scoped 在原有的 <template data=‘... 上增加作用域数据，约定使用 '$scopedata' 为替换变量名
        attrsMap['data'] = `{{ ...$root[$p], ...$root[$k], $root, $scopedata: ${$scopeStr} }}`
      } else {
        attrsMap['data'] = '{{...$root[$p], ...$root[$k], $root}}'
      }
      // slotAst 的 'v-bind:name' 不会在attrsList中出现，以此判断当前slot绑定了动态 name
      const bindedName = attrsMap['v-bind:name']
      if (bindedName) {
        const alias = closestForNode && closestForNode.alias
        // 如果 slot[:name] 在v-for作用域里
        if (alias && bindedName.startsWith(alias) && ['.', '', undefined].includes(bindedName[alias.length])) {
          attrsMap['is'] = `{{$for[${bindedName}] || 'default'}}`
        } else {
          attrsMap['is'] = `{{ $for[$root[$k].${bindedName}] || 'default' }}`
        }
      } else {
        attrsMap['is'] = `{{${slotName}}}`
      }
    } else {
      const slotsName = getSlotsName(slots)
      const restSlotsName = slotsName ? `, ${slotsName}` : ''
      attrsMap['data'] = `{{...$root[$kk+${mpcomid}], $root${restSlotsName}}}`
      attrsMap['is'] = components[tag].name
    }
    return ast
  }
}
