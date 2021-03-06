import {
  guessFieldTypeFromValue,
  guessFieldTypes,
  isDataFrame,
  isTableData,
  sortDataFrame,
  toDataFrame,
  toLegacyResponseData,
} from './processDataFrame';
import { DataFrameDTO, FieldType, TableData, TimeSeries } from '../types/index';
import { dateTime } from '../datetime/moment_wrapper';
import { MutableDataFrame } from './MutableDataFrame';

describe('toDataFrame', () => {
  it('converts timeseries to series', () => {
    const input1 = {
      target: 'Field Name',
      datapoints: [[100, 1], [200, 2]],
    };
    let series = toDataFrame(input1);
    expect(series.fields[0].name).toBe(input1.target);

    const v0 = series.fields[0].values;
    const v1 = series.fields[1].values;
    expect(v0.length).toEqual(2);
    expect(v1.length).toEqual(2);
    expect(v0.get(0)).toEqual(100);
    expect(v0.get(1)).toEqual(200);
    expect(v1.get(0)).toEqual(1);
    expect(v1.get(1)).toEqual(2);

    // Should fill a default name if target is empty
    const input2 = {
      // without target
      target: '',
      datapoints: [[100, 1], [200, 2]],
    };
    series = toDataFrame(input2);
    expect(series.fields[0].name).toEqual('Value');
  });

  it('assumes TimeSeries values are numbers', () => {
    const input1 = {
      target: 'time',
      datapoints: [[100, 1], [200, 2]],
    };
    const data = toDataFrame(input1);
    expect(data.fields[0].type).toBe(FieldType.number);
  });

  it('keeps dataFrame unchanged', () => {
    const input = toDataFrame({
      datapoints: [[100, 1], [200, 2]],
    });
    expect(input.length).toEqual(2);

    // If the object is alreay a DataFrame, it should not change
    const again = toDataFrame(input);
    expect(again).toBe(input);
  });

  it('migrate from 6.3 style rows', () => {
    const oldDataFrame = {
      fields: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      rows: [[100, 'A', 1], [200, 'B', 2], [300, 'C', 3]],
    };
    const data = toDataFrame(oldDataFrame);
    expect(data.length).toBe(oldDataFrame.rows.length);
  });

  it('Guess Colum Types from value', () => {
    expect(guessFieldTypeFromValue(1)).toBe(FieldType.number);
    expect(guessFieldTypeFromValue(1.234)).toBe(FieldType.number);
    expect(guessFieldTypeFromValue(3.125e7)).toBe(FieldType.number);
    expect(guessFieldTypeFromValue(true)).toBe(FieldType.boolean);
    expect(guessFieldTypeFromValue(false)).toBe(FieldType.boolean);
    expect(guessFieldTypeFromValue(new Date())).toBe(FieldType.time);
    expect(guessFieldTypeFromValue(dateTime())).toBe(FieldType.time);
  });

  it('Guess Colum Types from strings', () => {
    expect(guessFieldTypeFromValue('1')).toBe(FieldType.number);
    expect(guessFieldTypeFromValue('1.234')).toBe(FieldType.number);
    expect(guessFieldTypeFromValue('3.125e7')).toBe(FieldType.number);
    expect(guessFieldTypeFromValue('True')).toBe(FieldType.boolean);
    expect(guessFieldTypeFromValue('FALSE')).toBe(FieldType.boolean);
    expect(guessFieldTypeFromValue('true')).toBe(FieldType.boolean);
    expect(guessFieldTypeFromValue('xxxx')).toBe(FieldType.string);
  });

  it('Guess Colum Types from series', () => {
    const series = new MutableDataFrame({
      fields: [
        { name: 'A (number)', values: [123, null] },
        { name: 'B (strings)', values: [null, 'Hello'] },
        { name: 'C (nulls)', values: [null, null] },
        { name: 'Time', values: ['2000', 1967] },
      ],
    });
    const norm = guessFieldTypes(series);
    expect(norm.fields[0].type).toBe(FieldType.number);
    expect(norm.fields[1].type).toBe(FieldType.string);
    expect(norm.fields[2].type).toBe(FieldType.other);
    expect(norm.fields[3].type).toBe(FieldType.time); // based on name
  });

  it('converts JSON document data to series', () => {
    const input1 = {
      datapoints: [
        {
          _id: 'W5rvjW0BKe0cA-E1aHvr',
          _type: '_doc',
          _index: 'logs-2019.10.02',
          '@message': 'Deployed website',
          '@timestamp': [1570044340458],
          tags: ['deploy', 'website-01'],
          description: 'Torkel deployed website',
          coordinates: { latitude: 12, longitude: 121, level: { depth: 3, coolnes: 'very' } },
          'unescaped-content': 'breaking <br /> the <br /> row',
        },
      ],
      filterable: true,
      target: 'docs',
      total: 206,
      type: 'docs',
    };
    const dataFrame = toDataFrame(input1);
    expect(dataFrame.fields[0].name).toBe(input1.target);

    const v0 = dataFrame.fields[0].values;
    expect(v0.length).toEqual(1);
    expect(v0.get(0)).toEqual(input1.datapoints[0]);
  });
});

describe('SerisData backwards compatibility', () => {
  it('can convert TimeSeries to series and back again', () => {
    const timeseries = {
      target: 'Field Name',
      datapoints: [[100, 1], [200, 2]],
    };
    const series = toDataFrame(timeseries);
    expect(isDataFrame(timeseries)).toBeFalsy();
    expect(isDataFrame(series)).toBeTruthy();

    const roundtrip = toLegacyResponseData(series) as TimeSeries;
    expect(isDataFrame(roundtrip)).toBeFalsy();
    expect(roundtrip.target).toBe(timeseries.target);
  });

  it('can convert empty table to DataFrame then back to legacy', () => {
    const table = {
      columns: [],
      rows: [],
      type: 'table',
    };

    const series = toDataFrame(table);
    const roundtrip = toLegacyResponseData(series) as TableData;
    expect(roundtrip.columns.length).toBe(0);
    expect(roundtrip.type).toBe('table');
  });

  it('converts TableData to series and back again', () => {
    const table = {
      columns: [{ text: 'a', unit: 'ms' }, { text: 'b', unit: 'zz' }, { text: 'c', unit: 'yy' }],
      rows: [[100, 1, 'a'], [200, 2, 'a']],
    };
    const series = toDataFrame(table);
    expect(isTableData(table)).toBeTruthy();
    expect(isDataFrame(series)).toBeTruthy();
    expect(series.fields[0].config.unit).toEqual('ms');

    const roundtrip = toLegacyResponseData(series) as TimeSeries;
    expect(isTableData(roundtrip)).toBeTruthy();
    expect(roundtrip).toMatchObject(table);
  });

  it('can convert empty TableData to DataFrame', () => {
    const table = {
      columns: [],
      rows: [],
    };

    const series = toDataFrame(table);
    expect(series.fields.length).toBe(0);
  });

  it('can convert DataFrame to TableData to series and back again', () => {
    const json: DataFrameDTO = {
      refId: 'Z',
      meta: {
        somethign: 8,
      },
      fields: [
        { name: 'T', type: FieldType.time, values: [1, 2, 3] },
        { name: 'N', type: FieldType.number, config: { filterable: true }, values: [100, 200, 300] },
        { name: 'S', type: FieldType.string, config: { filterable: true }, values: ['1', '2', '3'] },
      ],
    };
    const series = toDataFrame(json);
    const table = toLegacyResponseData(series) as TableData;
    expect(table.refId).toBe(series.refId);
    expect(table.meta).toEqual(series.meta);

    const names = table.columns.map(c => c.text);
    expect(names).toEqual(['T', 'N', 'S']);
  });

  it('can convert TimeSeries to JSON document and back again', () => {
    const timeseries = {
      datapoints: [
        {
          _id: 'W5rvjW0BKe0cA-E1aHvr',
          _type: '_doc',
          _index: 'logs-2019.10.02',
          '@message': 'Deployed website',
          '@timestamp': [1570044340458],
          tags: ['deploy', 'website-01'],
          description: 'Torkel deployed website',
          coordinates: { latitude: 12, longitude: 121, level: { depth: 3, coolnes: 'very' } },
          'unescaped-content': 'breaking <br /> the <br /> row',
        },
      ],
      filterable: true,
      target: 'docs',
      total: 206,
      type: 'docs',
    };
    const series = toDataFrame(timeseries);
    expect(isDataFrame(timeseries)).toBeFalsy();
    expect(isDataFrame(series)).toBeTruthy();

    const roundtrip = toLegacyResponseData(series) as any;
    expect(isDataFrame(roundtrip)).toBeFalsy();
    expect(roundtrip.type).toBe('docs');
    expect(roundtrip.target).toBe('docs');
    expect(roundtrip.filterable).toBeTruthy();
  });
});

describe('sorted DataFrame', () => {
  const frame = toDataFrame({
    fields: [
      { name: 'fist', type: FieldType.time, values: [1, 2, 3] },
      { name: 'second', type: FieldType.string, values: ['a', 'b', 'c'] },
      { name: 'third', type: FieldType.number, values: [2000, 3000, 1000] },
    ],
  });
  it('Should sort numbers', () => {
    const sorted = sortDataFrame(frame, 0, true);
    expect(sorted.length).toEqual(3);
    expect(sorted.fields[0].values.toArray()).toEqual([3, 2, 1]);
    expect(sorted.fields[1].values.toArray()).toEqual(['c', 'b', 'a']);
  });

  it('Should sort strings', () => {
    const sorted = sortDataFrame(frame, 1, true);
    expect(sorted.length).toEqual(3);
    expect(sorted.fields[0].values.toArray()).toEqual([3, 2, 1]);
    expect(sorted.fields[1].values.toArray()).toEqual(['c', 'b', 'a']);
  });
});
