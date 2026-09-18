// SECURE COUNTERPART - functionally equivalent to the vulnerable fixture.
//
// .text() assigns the label as text, so markup inside a record label is shown
// literally instead of being parsed.
export function renderRecordLabels($list, records) {
  records.forEach((record) => {
    const $item = $('<li></li>');
    $item.text(record.label);
    $list.append($item);
  });
}
