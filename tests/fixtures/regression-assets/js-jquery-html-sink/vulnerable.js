// VULNERABLE FIXTURE - test input only, never ship this.
//
// Root cause: a server-supplied label is handed to jQuery .html(). jQuery
// parses the string as HTML and runs inline event handlers inside it.
export function renderRecordLabels($list, records) {
  records.forEach((record) => {
    const $item = $('<li></li>');
    $item.html(record.label);
    $list.append($item);
  });
}
