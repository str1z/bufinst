const bufinst = {
  _tdict: {
    t_id: {},
    id_t: {},
  },
  T: {
    bool: {
      size: () => 1,
      read: (c) => Boolean(c.view.getUint8(c.ptr++)),
      write: (c, data) => c.view.setUint8(c.ptr++, +data),
    },
    uint8: {
      size: () => 1,
      read: (c) => c.view.getUint8(c.ptr++),
      write: (c, data) => c.view.setUint8(c.ptr++, data),
    },
    uint16: {
      size: () => 2,
      read: (c) => c.view.getUint16((c.ptr += 2) - 2),
      write: (c, data) => c.view.setUint16((c.ptr += 2) - 2, data),
    },
    uint32: {
      size: () => 4,
      read: (c) => c.view.getUint32((c.ptr += 4) - 4),
      write: (c, data) => c.view.setUint32((c.ptr += 4) - 4, data),
    },
    int8: {
      size: () => 1,
      read: (c) => c.view.getInt8(c.ptr++),
      write: (c, data) => c.view.setInt8(c.ptr++, data),
    },
    int16: {
      size: () => 2,
      read: (c) => c.view.getInt16((c.ptr += 2) - 2),
      write: (c, data) => c.view.setInt16((c.ptr += 2) - 2, data),
    },
    int32: {
      size: () => 4,
      read: (c) => c.view.getInt32((c.ptr += 4) - 4),
      write: (c, data) => c.view.setInt32((c.ptr += 4) - 4, data),
    },
    float32: {
      size: () => 4,
      read: (c) => c.view.getFloat32((c.ptr += 4) - 4),
      write: (c, data) => c.view.setFloat32((c.ptr += 4) - 4, data),
    },
    float64: {
      size: () => 8,
      read: (c) => c.view.getFloat32((c.ptr += 8) - 8),
      write: (c, data) => c.view.setFloat32((c.ptr += 8) - 8, data),
    },

    array: (type, header) => {
      header = header || bufinst.T.uint8;
      return {
        fluid: true,
        size: type.fluid ? (data) => header.size() + data.reduce((acc, elem) => acc + type.size(elem), 0) : (data) => header.size() + data.length * type.size(data[0]),
        read: (c) => Array.from({ length: header.read(c) }).map(() => type.read(c)),
        write: (c, data) => {
          header.write(c, data.length);
          for (let elem of data) type.write(c, elem);
        },
      };
    },
    string: (type, header) => {
      type = type || bufinst.T.uint8;
      header = header || bufinst.T.uint8;
      return {
        fluid: true,
        size: (data) => header.size() + data.length * type.size(),
        read: (c) =>
          Array.from({ length: header.read(c) })
            .map(() => String.fromCharCode(type.read(c)))
            .join(""),
        write: (c, data) => {
          header.write(c, data.length);
          for (let elem of data) type.write(c, elem.charCodeAt());
        },
      };
    },
    struct: (struct) => {
      const keys = Object.keys(struct);
      let fluid = false,
        size;
      for (let key of keys) if (struct[key].fluid) fluid = true;
      if (!fluid) size = keys.reduce((acc, key) => acc + struct[key].size(), 0);
      return {
        fluid,
        size: fluid ? (data) => keys.reduce((acc, key) => acc + struct[key].size(data[key]), 0) : () => size,
        read: (c) => {
          let res = {};
          for (let key of keys) res[key] = struct[key].read(c);
          return res;
        },
        write: (c, data) => keys.forEach((key) => struct[key].write(c, data[key])),
      };
    },
    tuple: (...types) => {
      let fluid = false;
      for (let t of types) if (t.fluid) fluid = true;
      if (!fluid) size = types.reduce((acc, t) => acc + t.size(), 0);
      return {
        fluid,
        size: (data) => types.reduce((acc, t, i) => acc + t.size(data[i]), 0),
        read: (c) => types.map((t) => t.read(c)),
        write: (c, data) => types.forEach((t, i) => t.write(c, data[i])),
      };
    },
    enum: (...values) => {
      return {
        size: () => 1,
        read: (c) => values[bufinst.T.uint8.read(c)],
        write: (c, data) => bufinst.T.uint8.write(c, values.indexOf(data)),
      };
    },
    time: {
      size: () => 9,
      read: (c) => {
        let res = new Date();
        res.setFullYear(bufinst.T.uint16.read(c));
        res.setMonth(bufinst.T.uint8.read(c));
        res.setDate(bufinst.T.uint8.read(c));
        res.setHours(bufinst.T.uint8.read(c));
        res.setMinutes(bufinst.T.uint8.read(c));
        res.setSeconds(bufinst.T.uint8.read(c));
        res.setMilliseconds(bufinst.T.uint16.read(c));
        return res;
      },
      write: (c, date) => {
        bufinst.T.uint16.write(c, date.getFullYear());
        bufinst.T.uint8.write(c, date.getMonth());
        bufinst.T.uint8.write(c, date.getDate());
        bufinst.T.uint8.write(c, date.getHours());
        bufinst.T.uint8.write(c, date.getMinutes());
        bufinst.T.uint8.write(c, date.getSeconds());
        bufinst.T.uint16.write(c, date.getMilliseconds());
      },
    },
    any: {
      fluid: true,
      size: (data) => 1 + bufinst.T[bufinst.typeFit(data)].size(data),
      read: (c) => bufinst.T[bufinst._tdict.id_t[bufinst.T.uint8.read(c)]].read(c),
      write: (c, data) => {
        let type = bufinst.typeFit(data);
        bufinst.T.uint8.write(c, bufinst._tdict.t_id[type]);
        bufinst.T[type].write(c, data);
      },
    },
    object: {
      size: (data) => 1 + Object.keys(data).reduce((acc, key) => acc + bufinst.T.string8_8.size(key) + bufinst.T.any.size(data[key]), 0),
      read: (c) => {
        let res = {};
        let length = bufinst.T.uint8.read(c);
        for (let i = 0; i < length; i++) res[bufinst.T.string8_8.read(c)] = bufinst.T.any.read(c);
        return res;
      },
      write: (c, data) => {
        let keys = Object.keys(data);
        bufinst.T.uint8.write(c, keys.length);
        for (let key of keys) {
          bufinst.T.string8_8.write(c, key);
          bufinst.T.any.write(c, data[key]);
        }
      },
    },
  },
  typeFit: (v) => bufinst._typeofFit[typeof v](v),
  _typeofFit: {
    boolean: () => "bool",
    number: (n) => {
      if (n % 1 === 0)
        if (n >= 0) {
          if (n <= 255) return "uint8";
          if (n <= 65535) return "uint16";
          if (n <= 4294967295) return "uint32";
          return "float64";
        } else {
          if (n >= -128 && n <= 127) return "int8";
          if (n >= -32768 && n <= 32767) return "int16";
          if (n >= -2147483648 && n <= 2147483647) return "int32";
          return "float64";
        }
      return "float64";
    },
    string: (s) => {
      if (/^[\x00-\xff]*$/.test(s)) return s.length > 255 ? "string16_8" : "string8_8";
      return s.length > 255 ? "string16_16" : "string8_16";
    },
    object: (o) => {
      if (o instanceof Array) return o.length > 255 ? "list16" : "list8";
      return "object";
    },
  },
  buildType: (t) => {
    if (!t) return bufinst.T.any;
    if (typeof t === "function") return t();
    if (t.size && t.read && t.write) return t;
    if (t instanceof Array) {
      if (t.length == 1) return bufinst.T.array(bufinst.buildType(t[0]));
      else return bufinst.T.tuple(...t.map((e) => bufinst.buildType(e)));
    } else if (t instanceof Object) {
      let s = {};
      for (let key in t) s[key] = bufinst.buildType(t[key]);
      return bufinst.T.struct(s);
    }
  },
  Model: class {
    constructor(type) {
      this.type = bufinst.buildType(type);
    }
    parse(bin) {
      const c = {
        view: new DataView(bin),
        ptr: 0,
        bin,
      };
      return this.type.read(c);
    }
    serialize(data) {
      const buffer = new ArrayBuffer(this.type.size(data));
      const c = {
        view: new DataView(buffer),
        ptr: 0,
      };
      this.type.write(c, data);
      return buffer;
    }
  },
  Command: class {
    constructor(type, handler) {
      this.type = bufinst.buildType(type);
      this.handler = handler;
    }
    execute(c) {
      this.handler(this.type.read(c));
    }
  },
  Machine: class {
    constructor(header = bufinst.T.uint8) {
      this.header = header;
      this.commands = {};
      this.packed = [];
      this.size = 0;
    }
    register(id, command) {
      this.commands[id] = command;
    }
    eval(bin) {
      const c = {
        view: new DataView(bin),
        ptr: 0,
        bin,
      };
      while (c.ptr < c.view.byteLength) this.commands[this.header.read(c)].execute(c);
    }
    pack(id, data) {
      this.packed.push({ id, data });
      this.size += this.header.size(id) + this.commands[id].type.size(data);
      return this;
    }
    compile() {
      const buffer = new ArrayBuffer(this.size);
      const c = {
        view: new DataView(buffer),
        ptr: 0,
      };
      for (let p of this.packed) {
        this.header.write(c, p.id);
        this.commands[p.id].type.write(c, p.data);
      }
      return buffer;
    }
  },
};
bufinst.T.array8 = (type) => bufinst.T.array(type, bufinst.T.uint8);
bufinst.T.array16 = (type) => bufinst.T.array(type, bufinst.T.uint16);
bufinst.T.array32 = (type) => bufinst.T.array(type, bufinst.T.uint32);

bufinst.T.string8_8 = bufinst.T.string(bufinst.T.uint8, bufinst.T.uint8);
bufinst.T.string16_8 = bufinst.T.string(bufinst.T.uint8, bufinst.T.uint16);
bufinst.T.string32_8 = bufinst.T.string(bufinst.T.uint8, bufinst.T.uint32);
bufinst.T.string8_16 = bufinst.T.string(bufinst.T.uint16, bufinst.T.uint8);
bufinst.T.string16_16 = bufinst.T.string(bufinst.T.uint16, bufinst.T.uint16);
bufinst.T.string32_16 = bufinst.T.string(bufinst.T.uint16, bufinst.T.uint32);

bufinst.T.list = (header) => bufinst.T.array(bufinst.T.any, header);
bufinst.T.list8 = bufinst.T.array(bufinst.T.any, bufinst.T.uint8);
bufinst.T.list16 = bufinst.T.array(bufinst.T.any, bufinst.T.uint16);
bufinst.T.list32 = bufinst.T.array(bufinst.T.any, bufinst.T.uint32);

Object.keys(bufinst.T).forEach((t, id) => {
  bufinst._tdict.id_t[id] = t;
  bufinst._tdict.t_id[t] = id;
});

if (typeof module !== "undefined" && module.exports) module.exports = bufinst;
