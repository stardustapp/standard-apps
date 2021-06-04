<template>
<div class="panel-parent">
  <form class="form-panel"
      @submit.prevent="invoke">
    <h3 class="form-row">Invoke {{tab.path}}</h3>

    <p>
      <span v-if="inShape.type">
        Accepts a <strong>{{inShape.type}}</strong>.
      </span>
      <span v-if="outShape.type">
        Returns a <strong>{{outShape.type}}</strong>.
      </span>
    </p>

    <label
        v-for="prop in inShape.fields"
        :key="prop.name"
        class="form-row">
      <span>{{prop.name}}</span>
      <input type="text" :name="prop.name" v-model="input[prop.name]" :required="!prop.optional">
    </label>

    <div class="form-row">
      <button type="submit">Invoke</button>
    </div>

    <label class="form-row">
      <span>Output destination</span>
      <input type="text" name="output-path" v-model="outputPath">
    </label>

    <p v-show="status">
      Status: {{status}}
    </p>
  </form>

  <pre
      v-if="outShape.type === 'String'"
      class="func-output"
    >{{output}}</pre>
</div>
</template>

<script>
import { Skylink } from '@dustjs/client';
export default {
  props: {
    tab: Object,
  },
  data() {
    return {
      status: '',
      input: {},
      output: null,
      inShape: {},
      outShape: {},
      outputPath: '',
    };
  },
  computed: {
  },
  methods: {
    invoke() {
      var invokePath = this.tab.path;
      if (!this.tab.bare) {
        invokePath += '/invoke';
      }

      var input = null;
      if (this.inShape.type === 'Folder') {
        var props = [];
        this.inShape.fields.forEach(prop => {
          var val = this.input[prop.name];
          if (!val) {
            if (!prop.optional) {
              alert(`Property ${prop.name} is required`);
            }
            return;
          }

          switch (prop.type) {
            case 'String':
              props.push(Skylink.String(prop.name, val));
              break;

            default:
              alert(`Property ${prop.name} is supported to be unknown type ${prop.type}`);
          }
        });
        input = Skylink.Folder('input', props);
      } else if (this.inShape.type === 'String') {
        input = Skylink.String('input', prompt('input:'));
      }

      this.output = null;
      this.status = 'Pending';
      skylink
        .invoke(invokePath, input, this.outputPath)
        .then(out => {
          this.status = 'Completed';
          if (!out) {
            this.output = null;
          } else if (out.Type === 'String') {
            this.output = out.StringValue;
          } else {
            this.output = JSON.stringify(out);
          }
        }, err => {
          this.status = 'Crashed';
        });
        //.then(x => console.log('invocation got', x));
    },
  },
  created() {
    skylink.loadString(this.tab.path.slice(0, -6) + 'input')
    .then(raw => {
      this.inShape = JSON.parse(raw);
    });

    skylink.loadString(this.tab.path.slice(0, -6) + 'output')
    .then(raw => {
      this.outShape = JSON.parse(raw);
    });
  },
}
</script>
