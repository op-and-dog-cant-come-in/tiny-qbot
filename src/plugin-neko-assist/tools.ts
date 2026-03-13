export default [
  {
    type: 'function',
    function: {
      name: 'keep_silent',
      description: '猫猫决定保持沉默，不回应当前消息',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish_chatting',
      description: '猫猫认为已完成当前任务，主动结束对话循环',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'command',
      description: '前台执行系统指令，其执行结果只对猫猫可见，应根据需要将结果原样转发或整理后发送',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: '系统指令的完整内容，例如: /weather 浙江省杭州市',
          },
        },
      },
    },
  },
];
