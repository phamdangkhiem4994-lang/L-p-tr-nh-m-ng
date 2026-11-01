import { randomInt } from 'node:crypto';

const words = [
  'Mèo đi học', 'Khủng long uống trà sữa', 'Cá mập đi xe đạp', 'Gấu ngủ trên mặt trăng',
  'Chó đội mũ sinh nhật', 'Chim cánh cụt chơi bóng', 'Thỏ lái tên lửa', 'Vịt làm đầu bếp',
  'Robot tưới hoa', 'Bạch tuộc đánh trống', 'Ốc sên trượt ván', 'Ếch cầm ô',
  'Voi ngồi xích đu', 'Hươu cao cổ đeo khăn', 'Cua chơi guitar', 'Mặt trời đeo kính',
  'Người tuyết ăn kem', 'Bánh mì có chân', 'Phi hành gia câu cá', 'Cây xương rồng nhảy múa'
];

export function chooseWord() { return words[randomInt(words.length)]; }
